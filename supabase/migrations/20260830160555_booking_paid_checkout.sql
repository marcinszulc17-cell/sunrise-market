-- Connect booking holds to the existing marketplace order and settlement flow.

create index if not exists booking_offers_seller_idx
  on market.booking_offers(seller_id);
create index if not exists bookings_expiring_payment_idx
  on market.bookings(status, hold_expires_at)
  where status in ('held','pending_payment');

create policy booking_offers_rpc_only on market.booking_offers
  for all to anon, authenticated using (false) with check (false);
create policy booking_availability_rpc_only on market.booking_availability
  for all to anon, authenticated using (false) with check (false);
create policy bookings_rpc_only on market.bookings
  for all to anon, authenticated using (false) with check (false);

alter table market.seller_settlements
  add column if not exists available_at timestamptz;

alter table market.seller_settlements
  drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements
  add constraint seller_settlements_status_check
  check (status in ('scheduled','pending','settled','failed'));

create index if not exists seller_settlements_due_idx
  on market.seller_settlements(status, available_at, updated_at)
  where status in ('scheduled','pending','failed');

create or replace function market.checkout_booking(p_buyer_id uuid, p_booking_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to 'market','public'
as $$
declare
  v_booking market.bookings%rowtype;
  v_offer market.offers%rowtype;
  v_order_id uuid;
  v_rate numeric;
begin
  select * into v_booking
  from market.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null or v_booking.buyer_id <> p_buyer_id then
    raise exception 'Nie znaleziono rezerwacji';
  end if;
  if v_booking.status = 'pending_payment' and v_booking.order_id is not null
     and v_booking.hold_expires_at > now() then
    return v_booking.order_id;
  end if;
  if v_booking.status <> 'held' or v_booking.hold_expires_at <= now() then
    raise exception 'Blokada terminu wygasła';
  end if;

  select * into v_offer
  from market.offers
  where id = v_booking.offer_id and status = 'active';
  if v_offer.id is null or coalesce(v_offer.is_test, false) then
    raise exception 'Oferta jest niedostępna';
  end if;

  v_rate := market.commission_rate_for(v_offer.category_id);
  if coalesce(v_offer.commission_model, 'cashback_only') <> 'mlm_full' then
    select coalesce(s.commission_rate, v_rate) into v_rate
    from market.sellers s where s.id = v_offer.seller_id;
  end if;

  insert into market.orders(buyer_id, status, total_gross, cashback_amount)
  values (p_buyer_id, 'created', v_booking.amount_gross, 0)
  returning id into v_order_id;

  insert into market.order_items(
    order_id, offer_id, seller_id, qty, unit_price_gross,
    commission_rate, commission_amount, seller_payout
  ) values (
    v_order_id, v_booking.offer_id, v_booking.seller_id,
    v_booking.units, v_booking.unit_price_gross,
    v_rate, round(v_booking.amount_gross * v_rate, 2),
    round(v_booking.amount_gross * (1 - v_rate), 2)
  );

  update market.bookings
  set status = 'pending_payment', order_id = v_order_id,
      hold_expires_at = now() + interval '35 minutes', updated_at = now()
  where id = v_booking.id;

  return v_order_id;
end;
$$;

revoke all on function market.checkout_booking(uuid,uuid) from public, anon, authenticated;
grant execute on function market.checkout_booking(uuid,uuid) to service_role;

create or replace function market.confirm_paid_booking(
  p_order_id uuid,
  p_payment_provider text
)
returns uuid
language plpgsql
security invoker
set search_path to 'market','public'
as $$
declare
  v_booking_id uuid;
begin
  if p_payment_provider not in ('sunrise_pay','stripe') then
    raise exception 'Nieprawidłowa metoda płatności';
  end if;
  update market.bookings
  set status = 'confirmed', payment_provider = p_payment_provider,
      paid_at = coalesce(paid_at, now()), hold_expires_at = null, updated_at = now()
  where order_id = p_order_id
    and status in ('pending_payment','confirmed')
  returning id into v_booking_id;
  return v_booking_id;
end;
$$;

revoke all on function market.confirm_paid_booking(uuid,text) from public, anon, authenticated;
grant execute on function market.confirm_paid_booking(uuid,text) to service_role;

create or replace function market.expire_booking_payment(p_booking_id uuid, p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'market','public'
as $$
begin
  update market.bookings
  set status = 'expired', updated_at = now()
  where id = p_booking_id and order_id = p_order_id and status = 'pending_payment';
  update market.orders
  set status = 'cancelled'
  where id = p_order_id and status = 'created';
end;
$$;

revoke all on function market.expire_booking_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function market.expire_booking_payment(uuid,uuid) to service_role;

create or replace function market.release_unpaid_booking(p_booking_id uuid, p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'market','public'
as $$
begin
  update market.bookings
  set status = 'held', order_id = null,
      hold_expires_at = now() + interval '15 minutes', updated_at = now()
  where id = p_booking_id and order_id = p_order_id and status = 'pending_payment';
  delete from market.orders where id = p_order_id and status = 'created';
end;
$$;

revoke all on function market.release_unpaid_booking(uuid,uuid) from public, anon, authenticated;
grant execute on function market.release_unpaid_booking(uuid,uuid) to service_role;

-- Pending Stripe sessions only block until their checkout window expires.
create or replace function market.booking_available_slots(
  p_offer uuid,
  p_from timestamptz default now(),
  p_to timestamptz default now() + interval '30 days'
)
returns table(starts_at timestamptz, ends_at timestamptz, amount_gross numeric)
language plpgsql
stable
security definer
set search_path to 'market','public'
as $$
declare
  v_config market.booking_offers%rowtype;
  v_price numeric;
begin
  select b.* into v_config
  from market.booking_offers b
  join market.offers o on o.id = b.offer_id
  join market.sellers s on s.id = b.seller_id
  where b.offer_id = p_offer and b.active and o.status = 'active' and s.status = 'active';
  if v_config.offer_id is null or v_config.booking_type <> 'appointment' then return; end if;
  select coalesce(v_config.price_per_unit, o.price_gross) into v_price
  from market.offers o where o.id = v_config.offer_id;
  if p_to <= p_from or p_to > p_from + interval '62 days' then
    raise exception 'Zakres kalendarza może obejmować maksymalnie 62 dni';
  end if;

  return query
  with local_days as (
    select d::date as local_day
    from generate_series(
      (p_from at time zone v_config.timezone)::date,
      (p_to at time zone v_config.timezone)::date,
      interval '1 day'
    ) d
  ), candidates as (
    select gs as slot_start,
           gs + make_interval(mins => v_config.duration_minutes) as slot_end
    from local_days d
    join market.booking_availability a
      on a.offer_id = v_config.offer_id
     and a.weekday = extract(dow from d.local_day)::integer
    cross join lateral generate_series(
      (d.local_day + a.starts_at) at time zone v_config.timezone,
      ((d.local_day + a.ends_at) at time zone v_config.timezone)
        - make_interval(mins => v_config.duration_minutes),
      make_interval(mins => v_config.slot_interval_minutes)
    ) gs
  )
  select c.slot_start, c.slot_end, round(v_price, 2)
  from candidates c
  where c.slot_start >= greatest(p_from, now() + make_interval(hours => v_config.min_notice_hours))
    and c.slot_end <= p_to
    and c.slot_start <= now() + make_interval(days => v_config.max_advance_days)
    and not exists (
      select 1 from market.bookings x
      where x.offer_id = v_config.offer_id
        and (
          x.status = 'confirmed'
          or (x.status in ('held','pending_payment') and x.hold_expires_at > now())
        )
        and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
end;
$$;

revoke execute on function market.booking_available_slots(uuid,timestamptz,timestamptz) from public;
grant execute on function market.booking_available_slots(uuid,timestamptz,timestamptz) to anon, authenticated;

create or replace function market.create_booking_hold(
  p_offer uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null
)
returns table(
  booking_id uuid, starts_at timestamptz, ends_at timestamptz,
  amount_gross numeric, hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_config market.booking_offers%rowtype;
  v_offer market.offers%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_units integer;
  v_price numeric;
  v_id uuid;
  v_expiry timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then raise exception 'Zaloguj się, aby zarezerwować termin'; end if;
  if p_starts_at is null then raise exception 'Wybierz termin'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_offer::text, 0));

  select b.* into v_config from market.booking_offers b
  where b.offer_id = p_offer and b.active;
  select o.* into v_offer
  from market.offers o
  join market.sellers s on s.id = o.seller_id and s.status = 'active'
  where o.id = p_offer and o.status = 'active';
  if v_config.offer_id is null or v_offer.id is null or v_config.seller_id <> v_offer.seller_id then
    raise exception 'Rezerwacja tej oferty jest niedostępna';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_config.timezone) then
    raise exception 'Nieprawidłowa strefa czasowa oferty';
  end if;

  v_price := round(coalesce(v_config.price_per_unit, v_offer.price_gross), 2);
  if v_config.booking_type = 'appointment' then
    v_start := p_starts_at;
    v_end := p_starts_at + make_interval(mins => v_config.duration_minutes);
    v_units := 1;
    if p_ends_at is not null and abs(extract(epoch from (p_ends_at - v_end))) > 1 then
      raise exception 'Nieprawidłowa długość usługi';
    end if;
    if not exists (
      select 1 from market.booking_availability a
      where a.offer_id = p_offer
        and a.weekday = extract(dow from (v_start at time zone v_config.timezone))::integer
        and (v_start at time zone v_config.timezone)::date = (v_end at time zone v_config.timezone)::date
        and (v_start at time zone v_config.timezone)::time >= a.starts_at
        and (v_end at time zone v_config.timezone)::time <= a.ends_at
        and mod(
          floor(extract(epoch from ((v_start at time zone v_config.timezone)::time - a.starts_at)) / 60)::integer,
          v_config.slot_interval_minutes
        ) = 0
    ) then raise exception 'Wybrany termin nie jest dostępny'; end if;
  else
    v_start := (((p_starts_at at time zone v_config.timezone)::date)::timestamp at time zone v_config.timezone);
    if p_ends_at is null then raise exception 'Wybierz datę zakończenia rezerwacji'; end if;
    v_end := (((p_ends_at at time zone v_config.timezone)::date)::timestamp at time zone v_config.timezone);
    v_units := ((v_end at time zone v_config.timezone)::date - (v_start at time zone v_config.timezone)::date);
    if v_units < 1 then raise exception 'Rezerwacja musi trwać co najmniej jeden dzień'; end if;
    if v_units > v_config.max_units then raise exception 'Wybrany okres jest zbyt długi'; end if;
  end if;

  if v_start < now() + make_interval(hours => v_config.min_notice_hours) then
    raise exception 'Ten termin jest zbyt bliski';
  end if;
  if v_start > now() + make_interval(days => v_config.max_advance_days) then
    raise exception 'Nie można rezerwować z tak dużym wyprzedzeniem';
  end if;
  if v_end <= v_start then raise exception 'Nieprawidłowy zakres rezerwacji'; end if;

  update market.bookings b
  set status = 'expired', updated_at = now()
  where b.status in ('held','pending_payment') and b.hold_expires_at <= now();
  update market.orders o set status = 'cancelled'
  where o.status = 'created' and exists (
    select 1 from market.bookings b where b.order_id = o.id and b.status = 'expired'
  );
  update market.bookings
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where offer_id = p_offer and buyer_id = v_uid and status = 'held';

  if exists (
    select 1 from market.bookings x
    where x.offer_id = p_offer
      and (
        x.status = 'confirmed'
        or (x.status in ('held','pending_payment') and x.hold_expires_at > now())
      )
      and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
  ) then raise exception 'Ten termin został właśnie zajęty'; end if;

  insert into market.bookings(
    offer_id, seller_id, buyer_id, booking_type, starts_at, ends_at,
    units, unit_price_gross, amount_gross, status, hold_expires_at
  ) values (
    p_offer, v_offer.seller_id, v_uid, v_config.booking_type, v_start, v_end,
    v_units, v_price, round(v_price * v_units, 2), 'held', v_expiry
  ) returning id into v_id;

  return query select v_id, v_start, v_end, round(v_price * v_units, 2), v_expiry;
end;
$$;

revoke execute on function market.create_booking_hold(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function market.create_booking_hold(uuid,timestamptz,timestamptz) to authenticated;
