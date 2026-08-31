create or replace function market.booking_unavailable_days_resource_v2(
  p_offer uuid,
  p_resource uuid,
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
  if p_offer is null or p_resource is null or p_from is null or p_to is null then
    raise exception 'Podaj ofertę, zasób i zakres dat';
  end if;
  if p_to < p_from then raise exception 'Nieprawidłowy zakres dat'; end if;
  if p_to - p_from > 370 then raise exception 'Zakres dat jest zbyt duży'; end if;

  select b.timezone,b.booking_type into v_timezone,v_type
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active;

  if v_timezone is null or v_type<>'daily' then return; end if;
  if not exists(
    select 1 from market.booking_offer_resources bor
    join market.booking_resources r on r.id=bor.resource_id and r.active
    where bor.offer_id=p_offer and bor.resource_id=p_resource
  ) then raise exception 'Wybrany zasób jest niedostępny'; end if;

  return query
  with days as (
    select gs::date as day,
           (gs::date::timestamp at time zone v_timezone) as starts_at,
           ((gs::date+1)::timestamp at time zone v_timezone) as ends_at
    from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') gs
  )
  select d.day,
         case when exists(
           select 1 from market.booking_blocks z
           where z.offer_id=p_offer
             and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
         ) then 'blocked' else 'booked' end
  from days d
  where exists(
    select 1 from market.booking_blocks z
    where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
  )
  or not market.booking_daily_resource_available(p_offer,p_resource,d.starts_at,d.ends_at)
  order by d.day;
end;
$$;

create or replace function market.booking_daily_quote_resource_v2(
  p_offer uuid,
  p_resource uuid,
  p_from date,
  p_to date
)
returns table(days integer, base numeric)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_quote record;
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_resource is null then raise exception 'Wybierz zasób'; end if;

  select * into v_quote from market.booking_daily_quote_v2(p_offer,p_from,p_to);
  if v_quote.days is null then raise exception 'Nie udało się wycenić rezerwacji'; end if;

  select b.timezone into v_timezone
  from market.booking_offers b
  where b.offer_id=p_offer and b.active and b.booking_type='daily';
  if v_timezone is null then raise exception 'Rezerwacja dobowa tej oferty jest niedostępna'; end if;

  v_start:=(p_from::timestamp at time zone v_timezone);
  v_end:=(p_to::timestamp at time zone v_timezone);

  if not market.booking_daily_resource_available(p_offer,p_resource,v_start,v_end) then
    raise exception 'Wybrany zasób jest niedostępny przez cały wybrany okres';
  end if;

  return query select v_quote.days::integer,v_quote.base::numeric;
end;
$$;

revoke all on function market.booking_unavailable_days_resource_v2(uuid,uuid,date,date) from public;
grant execute on function market.booking_unavailable_days_resource_v2(uuid,uuid,date,date) to anon, authenticated;
revoke all on function market.booking_daily_quote_resource_v2(uuid,uuid,date,date) from public;
grant execute on function market.booking_daily_quote_resource_v2(uuid,uuid,date,date) to anon, authenticated;
