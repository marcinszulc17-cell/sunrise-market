create or replace function market.seller_booking_daily_resources(p_booking uuid)
returns table(id uuid, name text, kind text, available boolean, is_current boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  select b.* into v_booking from market.bookings b where b.id=p_booking;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.booking_type<>'daily' then raise exception 'Ta operacja dotyczy tylko wynajmów dobowych'; end if;

  return query
  select r.id,r.name,r.kind,
    not exists(
      select 1 from market.booking_resource_time_off t
      where t.resource_id=r.id
        and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(v_booking.starts_at,v_booking.ends_at,'[)')
    )
    and not exists(
      select 1 from market.bookings x
      where x.id<>v_booking.id
        and x.offer_id=v_booking.offer_id
        and (x.resource_id=r.id or x.resource_id is null)
        and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(v_booking.starts_at,v_booking.ends_at,'[)')
    ) as available,
    r.id=v_booking.resource_id as is_current
  from market.booking_offer_resources bor
  join market.booking_resources r on r.id=bor.resource_id
  where bor.offer_id=v_booking.offer_id
    and r.seller_id=v_booking.seller_id
    and (r.active or r.id=v_booking.resource_id)
  order by (r.id=v_booking.resource_id) desc,
    case r.kind when 'vehicle' then 1 when 'property' then 2 when 'room' then 3 when 'equipment' then 4 else 9 end,
    r.name;
end;
$$;

create or replace function market.seller_booking_daily_move(p_booking uuid,p_starts_at timestamptz,p_resource uuid)
returns table(starts_at timestamptz,ends_at timestamptz,resource_id uuid,resource_name text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
  v_config market.booking_offers%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_local_start timestamp;
  v_resource_name text;
  v_title text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null or p_resource is null then raise exception 'Wybierz rezerwację, datę i zasób'; end if;

  select b.* into v_booking from market.bookings b where b.id=p_booking for update;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.status<>'confirmed' then raise exception 'Przenosić można tylko potwierdzone rezerwacje'; end if;
  if v_booking.booking_type<>'daily' then raise exception 'Ta operacja dotyczy tylko wynajmów dobowych'; end if;

  select bo.* into v_config from market.booking_offers bo where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu'; end if;

  select r.name into v_resource_name
  from market.booking_offer_resources bor
  join market.booking_resources r on r.id=bor.resource_id
  where bor.offer_id=v_booking.offer_id
    and r.id=p_resource
    and r.seller_id=v_booking.seller_id
    and r.active;
  if v_resource_name is null then raise exception 'Wybrany zasób nie jest aktywny dla tej oferty'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_booking.offer_id::text||':daily',0));

  v_local_start:=(p_starts_at at time zone v_config.timezone)::date::timestamp;
  v_start:=v_local_start at time zone v_config.timezone;
  v_end:=(v_local_start+make_interval(days=>v_booking.units)) at time zone v_config.timezone;

  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Nowy termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nowy termin jest zbyt odległy'; end if;

  if v_start=v_booking.starts_at and p_resource=v_booking.resource_id then
    return query select v_booking.starts_at,v_booking.ends_at,v_booking.resource_id,v_resource_name;
    return;
  end if;

  if exists(
    select 1 from market.booking_blocks z
    where z.offer_id=v_booking.offer_id
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'Nowy okres jest zablokowany przez sprzedawcę'; end if;

  if exists(
    select 1 from market.booking_resource_time_off t
    where t.resource_id=p_resource
      and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'Wybrany zasób jest niedostępny w tym okresie'; end if;

  if exists(
    select 1 from market.bookings x
    where x.id<>v_booking.id
      and x.offer_id=v_booking.offer_id
      and (x.resource_id=p_resource or x.resource_id is null)
      and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'Wybrany zasób jest zajęty w tym okresie'; end if;

  update market.bookings
  set starts_at=v_start,ends_at=v_end,resource_id=p_resource,updated_at=now()
  where id=v_booking.id;

  select o.title into v_title from market.offers o where o.id=v_booking.offer_id;
  insert into market.notifications(user_id,channel,type,title,body)
  values(
    v_booking.buyer_id,'app','booking_rescheduled','Rezerwacja została przeniesiona',
    coalesce(v_title,'Rezerwacja')||': '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY')||' – '||to_char(v_end at time zone v_config.timezone,'DD.MM.YYYY')||', zasób: '||v_resource_name||'.'
  );

  return query select v_start,v_end,p_resource,v_resource_name;
end;
$$;

revoke all on function market.seller_booking_daily_resources(uuid) from public;
revoke execute on function market.seller_booking_daily_resources(uuid) from anon;
grant execute on function market.seller_booking_daily_resources(uuid) to authenticated;

revoke all on function market.seller_booking_daily_move(uuid,timestamptz,uuid) from public;
revoke execute on function market.seller_booking_daily_move(uuid,timestamptz,uuid) from anon;
grant execute on function market.seller_booking_daily_move(uuid,timestamptz,uuid) to authenticated;
