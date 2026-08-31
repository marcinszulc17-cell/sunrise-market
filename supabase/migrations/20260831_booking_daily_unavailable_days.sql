create or replace function market.booking_unavailable_days_v2(
  p_offer uuid,
  p_from date,
  p_to date
)
returns table(day date, reason text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_timezone text;
  v_type text;
begin
  if p_offer is null or p_from is null or p_to is null then
    raise exception 'Podaj ofertę i zakres dat';
  end if;
  if p_to < p_from then
    raise exception 'Nieprawidłowy zakres dat';
  end if;
  if p_to - p_from > 370 then
    raise exception 'Zakres dat jest zbyt duży';
  end if;

  select b.timezone, b.booking_type
    into v_timezone, v_type
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active;

  if v_timezone is null or v_type <> 'daily' then
    return;
  end if;

  return query
  with days as (
    select gs::date as day,
           (gs::date::timestamp at time zone v_timezone) as starts_at,
           ((gs::date + 1)::timestamp at time zone v_timezone) as ends_at
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  )
  select d.day,
         case
           when exists (
             select 1 from market.booking_blocks z
             where z.offer_id=p_offer
               and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
           ) then 'blocked'
           else 'booked'
         end as reason
  from days d
  where exists (
    select 1 from market.booking_blocks z
    where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
  ) or exists (
    select 1 from market.bookings x
    where x.offer_id=p_offer
      and (
        x.status='confirmed'
        or (x.status in ('held','pending_payment') and x.hold_expires_at>now())
      )
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
  )
  order by d.day;
end;
$$;

revoke all on function market.booking_unavailable_days_v2(uuid,date,date) from public;
grant execute on function market.booking_unavailable_days_v2(uuid,date,date) to anon, authenticated;
