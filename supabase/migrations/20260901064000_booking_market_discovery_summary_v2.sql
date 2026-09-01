create or replace function market.booking_market_discovery_summary_v1(
  p_offer_ids uuid[],
  p_days integer default 30
)
returns table(
  offer_id uuid,
  booking_type text,
  price_from numeric,
  nearest_available_at timestamptz,
  nearest_available_day date,
  available_today boolean,
  available_this_weekend boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  r record;
  v_days integer := greatest(1, least(coalesce(p_days,30), 90));
  v_today date := current_date;
  v_next_sat date;
  v_next_mon date;
  v_nearest timestamptz;
  v_nearest_day date;
  v_today_ok boolean;
  v_weekend_ok boolean;
  v_price numeric;
begin
  if p_offer_ids is null or cardinality(p_offer_ids)=0 then return; end if;
  v_next_sat := v_today + ((6 - extract(isodow from v_today)::int + 7) % 7);
  v_next_mon := v_next_sat + 2;

  for r in
    select o.id as offer_id,
           case
             when coalesce(o.attributes->>'purchase_mode','purchase') in ('appointment','daily')
               then coalesce(b.booking_type,o.attributes->>'purchase_mode')
             else 'purchase'
           end as mode,
           b.booking_type as active_booking_type,
           b.price_per_unit,
           o.price_gross
    from market.offers o
    join market.sellers s on s.id=o.seller_id and s.status='active'
    left join market.booking_offers b on b.offer_id=o.id and b.active
    where o.status='active' and o.id=any(p_offer_ids)
  loop
    v_nearest := null; v_nearest_day := null; v_today_ok := false; v_weekend_ok := false;
    v_price := coalesce(r.price_per_unit,r.price_gross);

    if r.mode='appointment' and r.active_booking_type='appointment' then
      select min(x.starts_at), coalesce(min(x.amount_gross), r.price_gross)
        into v_nearest, v_price
      from market.booking_available_slots_v2(r.offer_id,null,null,now(),now() + make_interval(days=>v_days)) x;
      v_nearest_day := (v_nearest at time zone 'Europe/Warsaw')::date;
      v_today_ok := exists(
        select 1 from market.booking_available_slots_v2(
          r.offer_id,null,null,now(),((v_today + 1)::timestamp at time zone 'Europe/Warsaw')
        ) x
      );
      v_weekend_ok := exists(
        select 1 from market.booking_available_slots_v2(
          r.offer_id,null,null,
          (v_next_sat::timestamp at time zone 'Europe/Warsaw'),
          (v_next_mon::timestamp at time zone 'Europe/Warsaw')
        ) x
      );
    elsif r.mode='daily' and r.active_booking_type='daily' then
      select d.day into v_nearest_day
      from generate_series(v_today, v_today + v_days, interval '1 day') gs(day)
      cross join lateral (select gs.day::date as day) d
      where not exists (
        select 1 from market.booking_unavailable_days_v2(r.offer_id,d.day,d.day) u where u.day=d.day
      )
      order by d.day limit 1;
      v_nearest := case when v_nearest_day is null then null else (v_nearest_day::timestamp at time zone 'Europe/Warsaw') end;
      v_today_ok := not exists(select 1 from market.booking_unavailable_days_v2(r.offer_id,v_today,v_today) u);
      v_weekend_ok := not exists(select 1 from market.booking_unavailable_days_v2(r.offer_id,v_next_sat,v_next_mon-1) u);
    end if;

    offer_id := r.offer_id;
    booking_type := r.mode;
    price_from := v_price;
    nearest_available_at := v_nearest;
    nearest_available_day := v_nearest_day;
    available_today := coalesce(v_today_ok,false);
    available_this_weekend := coalesce(v_weekend_ok,false);
    return next;
  end loop;
end;
$function$;
