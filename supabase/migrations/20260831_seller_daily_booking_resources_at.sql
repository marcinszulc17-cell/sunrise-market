create or replace function market.seller_booking_daily_resources_at(p_booking uuid,p_starts_at timestamptz)
returns table(id uuid, name text, kind text, available boolean, is_current boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
  v_config market.booking_offers%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_local_start timestamp;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null then raise exception 'Wybierz rezerwację i termin'; end if;
  select b.* into v_booking from market.bookings b where b.id=p_booking;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.booking_type<>'daily' then raise exception 'Ta operacja dotyczy tylko wynajmów dobowych'; end if;
  select bo.* into v_config from market.booking_offers bo where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu'; end if;

  v_local_start:=(p_starts_at at time zone v_config.timezone)::date::timestamp;
  v_start:=v_local_start at time zone v_config.timezone;
  v_end:=(v_local_start+make_interval(days=>v_booking.units)) at time zone v_config.timezone;

  return query
  select r.id,r.name,r.kind,
    not exists(
      select 1 from market.booking_resource_time_off t
      where t.resource_id=r.id
        and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
    )
    and not exists(
      select 1 from market.bookings x
      where x.id<>v_booking.id
        and x.offer_id=v_booking.offer_id
        and (x.resource_id=r.id or x.resource_id is null)
        and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
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

revoke all on function market.seller_booking_daily_resources_at(uuid,timestamptz) from public;
revoke execute on function market.seller_booking_daily_resources_at(uuid,timestamptz) from anon;
grant execute on function market.seller_booking_daily_resources_at(uuid,timestamptz) to authenticated;
