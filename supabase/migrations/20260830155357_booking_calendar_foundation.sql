-- Shared booking calendar for services and rentable resources.
-- Payment stays in the existing orders/checkout flow; this migration only owns
-- availability, short-lived holds and the booking lifecycle.

create table if not exists market.booking_offers (
  offer_id uuid primary key references market.offers(id) on delete cascade,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  booking_type text not null check (booking_type in ('appointment','daily')),
  timezone text not null default 'Europe/Warsaw',
  duration_minutes integer,
  slot_interval_minutes integer not null default 30,
  min_notice_hours integer not null default 2,
  max_advance_days integer not null default 180,
  max_units integer not null default 30,
  price_per_unit numeric(12,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_minutes is null or duration_minutes between 15 and 1440),
  check (slot_interval_minutes between 5 and 1440),
  check (min_notice_hours between 0 and 8760),
  check (max_advance_days between 1 and 730),
  check (max_units between 1 and 366),
  check (price_per_unit is null or price_per_unit >= 0),
  check (
    (booking_type = 'appointment' and duration_minutes is not null)
    or (booking_type = 'daily' and duration_minutes is null)
  )
);

create table if not exists market.booking_availability (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references market.booking_offers(offer_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (offer_id, weekday, starts_at, ends_at)
);

create table if not exists market.bookings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references market.offers(id) on delete restrict,
  seller_id uuid not null references market.sellers(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  booking_type text not null check (booking_type in ('appointment','daily')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  units integer not null check (units > 0),
  unit_price_gross numeric(12,2) not null check (unit_price_gross >= 0),
  amount_gross numeric(12,2) not null check (amount_gross >= 0),
  status text not null default 'held'
    check (status in ('held','pending_payment','confirmed','cancelled','completed','expired')),
  hold_expires_at timestamptz,
  order_id uuid unique references market.orders(id) on delete set null,
  payment_provider text check (payment_provider is null or payment_provider in ('sunrise_pay','stripe')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (amount_gross = round(unit_price_gross * units, 2)),
  check ((status <> 'held') or hold_expires_at is not null)
);

create index if not exists booking_availability_offer_weekday_idx
  on market.booking_availability(offer_id, weekday, starts_at);
create index if not exists bookings_offer_period_idx
  on market.bookings(offer_id, starts_at, ends_at);
create index if not exists bookings_buyer_created_idx
  on market.bookings(buyer_id, created_at desc);
create index if not exists bookings_seller_starts_idx
  on market.bookings(seller_id, starts_at);

alter table market.booking_offers enable row level security;
alter table market.booking_availability enable row level security;
alter table market.bookings enable row level security;

revoke all on table market.booking_offers from public, anon, authenticated;
revoke all on table market.booking_availability from public, anon, authenticated;
revoke all on table market.bookings from public, anon, authenticated;

create or replace function market.booking_public_config(p_offer uuid)
returns table(
  offer_id uuid,
  booking_type text,
  timezone text,
  duration_minutes integer,
  slot_interval_minutes integer,
  min_notice_hours integer,
  max_advance_days integer,
  max_units integer,
  price_per_unit numeric,
  weekly_availability jsonb
)
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select b.offer_id, b.booking_type, b.timezone, b.duration_minutes,
         b.slot_interval_minutes, b.min_notice_hours, b.max_advance_days,
         b.max_units, coalesce(b.price_per_unit, o.price_gross) as price_per_unit,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'weekday', a.weekday,
               'starts_at', to_char(a.starts_at, 'HH24:MI'),
               'ends_at', to_char(a.ends_at, 'HH24:MI')
             ) order by a.weekday, a.starts_at
           )
           from market.booking_availability a
           where a.offer_id = b.offer_id
         ), '[]'::jsonb)
  from market.booking_offers b
  join market.offers o on o.id = b.offer_id
  join market.sellers s on s.id = b.seller_id
  where b.offer_id = p_offer
    and b.active
    and o.status = 'active'
    and s.status = 'active';
$$;

revoke execute on function market.booking_public_config(uuid) from public;
grant execute on function market.booking_public_config(uuid) to anon, authenticated;

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

  if v_config.offer_id is null or v_config.booking_type <> 'appointment' then
    return;
  end if;
  select coalesce(v_config.price_per_unit, o.price_gross) into v_price
  from market.offers o
  where o.id = v_config.offer_id;
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
      select 1
      from market.bookings x
      where x.offer_id = v_config.offer_id
        and (
          x.status in ('pending_payment','confirmed')
          or (x.status = 'held' and x.hold_expires_at > now())
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
  booking_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  amount_gross numeric,
  hold_expires_at timestamptz
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

  select b.* into v_config
  from market.booking_offers b
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
    ) then
      raise exception 'Wybrany termin nie jest dostępny';
    end if;
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

  update market.bookings
  set status = 'expired', updated_at = now()
  where status = 'held' and hold_expires_at <= now();

  update market.bookings
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where offer_id = p_offer and buyer_id = v_uid and status = 'held';

  if exists (
    select 1 from market.bookings x
    where x.offer_id = p_offer
      and (
        x.status in ('pending_payment','confirmed')
        or (x.status = 'held' and x.hold_expires_at > now())
      )
      and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
  ) then
    raise exception 'Ten termin został właśnie zajęty';
  end if;

  insert into market.bookings(
    offer_id, seller_id, buyer_id, booking_type, starts_at, ends_at,
    units, unit_price_gross, amount_gross, status, hold_expires_at
  ) values (
    p_offer, v_offer.seller_id, v_uid, v_config.booking_type, v_start, v_end,
    v_units, v_price, round(v_price * v_units, 2), 'held', v_expiry
  ) returning id into v_id;

  return query
  select v_id, v_start, v_end, round(v_price * v_units, 2), v_expiry;
end;
$$;

revoke execute on function market.create_booking_hold(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function market.create_booking_hold(uuid,timestamptz,timestamptz) to authenticated;

create or replace function market.my_bookings()
returns table(
  id uuid, offer_id uuid, title text, booking_type text, starts_at timestamptz,
  ends_at timestamptz, units integer, amount_gross numeric, status text,
  order_id uuid, payment_provider text, hold_expires_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select b.id, b.offer_id, o.title, b.booking_type, b.starts_at, b.ends_at,
         b.units, b.amount_gross, b.status, b.order_id, b.payment_provider,
         b.hold_expires_at, b.created_at
  from market.bookings b
  join market.offers o on o.id = b.offer_id
  where b.buyer_id = auth.uid()
  order by b.starts_at desc;
$$;

revoke execute on function market.my_bookings() from public, anon;
grant execute on function market.my_bookings() to authenticated;

create or replace function market.seller_bookings()
returns table(
  id uuid, offer_id uuid, title text, buyer_id uuid, booking_type text,
  starts_at timestamptz, ends_at timestamptz, units integer, amount_gross numeric,
  status text, order_id uuid, payment_provider text, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select b.id, b.offer_id, o.title, b.buyer_id, b.booking_type,
         b.starts_at, b.ends_at, b.units, b.amount_gross, b.status,
         b.order_id, b.payment_provider, b.created_at
  from market.bookings b
  join market.offers o on o.id = b.offer_id
  join market.sellers s on s.id = b.seller_id
  where lower(s.email) = lower(coalesce(auth.jwt()->>'email',''))
  order by b.starts_at desc;
$$;

revoke execute on function market.seller_bookings() from public, anon;
grant execute on function market.seller_bookings() to authenticated;

create or replace function market.configure_booking_offer(
  p_offer uuid,
  p_booking_type text,
  p_timezone text default 'Europe/Warsaw',
  p_duration_minutes integer default null,
  p_slot_interval_minutes integer default 30,
  p_min_notice_hours integer default 2,
  p_max_advance_days integer default 180,
  p_max_units integer default 30,
  p_price_per_unit numeric default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_offer market.offers%rowtype;
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  select o.* into v_offer
  from market.offers o
  join market.sellers s on s.id = o.seller_id
  where o.id = p_offer
    and lower(s.email) = lower(coalesce(auth.jwt()->>'email',''));
  if v_offer.id is null then raise exception 'Brak dostępu do oferty'; end if;
  if p_booking_type not in ('appointment','daily') then raise exception 'Nieprawidłowy typ rezerwacji'; end if;
  if p_booking_type = 'appointment' and coalesce(p_duration_minutes, 0) < 15 then raise exception 'Podaj czas trwania usługi'; end if;
  if p_booking_type = 'daily' then p_duration_minutes := null; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Nieprawidłowa strefa czasowa'; end if;

  insert into market.booking_offers(
    offer_id, seller_id, booking_type, timezone, duration_minutes,
    slot_interval_minutes, min_notice_hours, max_advance_days,
    max_units, price_per_unit, active, updated_at
  ) values (
    p_offer, v_offer.seller_id, p_booking_type, p_timezone, p_duration_minutes,
    p_slot_interval_minutes, p_min_notice_hours, p_max_advance_days,
    p_max_units, p_price_per_unit, p_active, now()
  )
  on conflict (offer_id) do update set
    seller_id = excluded.seller_id,
    booking_type = excluded.booking_type,
    timezone = excluded.timezone,
    duration_minutes = excluded.duration_minutes,
    slot_interval_minutes = excluded.slot_interval_minutes,
    min_notice_hours = excluded.min_notice_hours,
    max_advance_days = excluded.max_advance_days,
    max_units = excluded.max_units,
    price_per_unit = excluded.price_per_unit,
    active = excluded.active,
    updated_at = now();
end;
$$;

revoke execute on function market.configure_booking_offer(uuid,text,text,integer,integer,integer,integer,integer,numeric,boolean) from public, anon;
grant execute on function market.configure_booking_offer(uuid,text,text,integer,integer,integer,integer,integer,numeric,boolean) to authenticated;

create or replace function market.replace_booking_availability(p_offer uuid, p_windows jsonb)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  if jsonb_typeof(p_windows) <> 'array' then raise exception 'Nieprawidłowy harmonogram'; end if;
  v_count := jsonb_array_length(p_windows);
  if v_count > 50 then raise exception 'Harmonogram ma zbyt wiele przedziałów'; end if;
  if not exists (
    select 1
    from market.booking_offers b
    join market.sellers s on s.id = b.seller_id
    where b.offer_id = p_offer
      and lower(s.email) = lower(coalesce(auth.jwt()->>'email',''))
  ) then raise exception 'Brak dostępu do oferty'; end if;

  delete from market.booking_availability where offer_id = p_offer;
  insert into market.booking_availability(offer_id, weekday, starts_at, ends_at)
  select p_offer,
         (x->>'weekday')::smallint,
         (x->>'starts_at')::time,
         (x->>'ends_at')::time
  from jsonb_array_elements(p_windows) x;
end;
$$;

revoke execute on function market.replace_booking_availability(uuid,jsonb) from public, anon;
grant execute on function market.replace_booking_availability(uuid,jsonb) to authenticated;

comment on table market.booking_offers is 'Booking configuration layered on existing marketplace offers.';
comment on table market.bookings is 'Time-bound reservations linked to the existing order and payment lifecycle.';
comment on function market.create_booking_hold(uuid,timestamptz,timestamptz) is 'Atomically reserves a slot for 15 minutes; payment integration attaches the normal market order.';
