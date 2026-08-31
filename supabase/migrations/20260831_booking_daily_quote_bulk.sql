create or replace function market.booking_daily_quote_v2(
  p_offer uuid,
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
  v_config market.booking_offers%rowtype;
  v_days integer;
  v_base numeric;
begin
  if p_offer is null or p_from is null or p_to is null then
    raise exception 'Wybierz prawidłowy okres rezerwacji';
  end if;

  select b.* into v_config
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active and b.booking_type='daily';

  if v_config.offer_id is null then
    raise exception 'Rezerwacja dobowa tej oferty jest niedostępna';
  end if;

  v_days := p_to - p_from;
  if v_days < greatest(1, coalesce(v_config.min_units,1)) then
    raise exception 'Wybrany okres jest zbyt krótki';
  end if;
  if v_days > v_config.max_units then
    raise exception 'Wybrany okres jest zbyt długi';
  end if;
  if v_days > 366 then
    raise exception 'Zakres wyceny może obejmować maksymalnie 366 dni';
  end if;

  select round(coalesce(sum(market.booking_price_for_day(p_offer, d::date)),0),2)
  into v_base
  from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') d;

  return query select v_days, v_base;
end;
$$;

revoke all on function market.booking_daily_quote_v2(uuid,date,date) from public;
grant execute on function market.booking_daily_quote_v2(uuid,date,date) to anon, authenticated;
