create or replace function market.seller_booking_dashboard_v2()
returns table(
  id uuid,
  offer_id uuid,
  title text,
  buyer_id uuid,
  buyer_name text,
  buyer_email text,
  booking_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  units integer,
  amount_gross numeric,
  status text,
  order_id uuid,
  payment_provider text,
  paid_at timestamptz,
  hold_expires_at timestamptz,
  created_at timestamptz,
  service_id uuid,
  resource_id uuid,
  resource_name text,
  resource_kind text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.offer_id,
    o.title,
    b.buyer_id,
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')::text,
    u.email::text,
    b.booking_type,
    b.starts_at,
    b.ends_at,
    b.units,
    b.amount_gross,
    b.status,
    b.order_id,
    b.payment_provider,
    b.paid_at,
    b.hold_expires_at,
    b.created_at,
    b.service_id,
    b.resource_id,
    r.name::text,
    r.kind::text
  from market.bookings b
  join market.offers o on o.id = b.offer_id
  left join auth.users u on u.id = b.buyer_id
  left join market.booking_resources r on r.id = b.resource_id
  where b.seller_id = market.current_seller_id() or market.is_operator()
  order by b.starts_at desc;
$$;

create or replace function market.seller_booking_resources_dashboard()
returns table(id uuid, name text, kind text, description text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.kind, r.description, r.active
  from market.booking_resources r
  where (r.seller_id = market.current_seller_id() or market.is_operator())
    and r.active = true
  order by
    case r.kind
      when 'staff' then 1
      when 'vehicle' then 2
      when 'property' then 3
      when 'room' then 4
      when 'equipment' then 5
      else 9
    end,
    r.name;
$$;

revoke execute on function market.seller_booking_dashboard_v2() from public, anon, authenticated;
revoke execute on function market.seller_booking_resources_dashboard() from public, anon, authenticated;
grant execute on function market.seller_booking_dashboard_v2() to authenticated;
grant execute on function market.seller_booking_resources_dashboard() to authenticated;