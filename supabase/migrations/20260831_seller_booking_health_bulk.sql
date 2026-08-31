create or replace function market.seller_booking_health_bulk()
returns table(
  offer_id uuid,
  booking_type text,
  active boolean,
  availability_count bigint,
  bookings bigint,
  active_bookings bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_seller uuid := market.current_seller_id();
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null and not market.is_operator() then raise exception 'Brak konta sprzedawcy'; end if;

  return query
  select
    o.id,
    bo.booking_type,
    coalesce(bo.active,false),
    case when bo.booking_type='appointment' then (select count(*) from market.booking_availability a where a.offer_id=o.id) else 0 end,
    (select count(*) from market.bookings b where b.offer_id=o.id),
    (select count(*) from market.bookings b where b.offer_id=o.id and b.status in ('held','pending_payment','confirmed'))
  from market.offers o
  left join market.booking_offers bo on bo.offer_id=o.id
  where o.seller_id=v_seller or market.is_operator()
  order by o.created_at desc;
end;
$$;

revoke all on function market.seller_booking_health_bulk() from public;
revoke execute on function market.seller_booking_health_bulk() from anon;
grant execute on function market.seller_booking_health_bulk() to authenticated;
