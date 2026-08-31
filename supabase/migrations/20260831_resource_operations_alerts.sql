-- Extend seller resource operations dashboard with overdue returns and expiring maintenance/time-off.
-- PostgreSQL cannot change a function OUT/RETURNS TABLE signature via CREATE OR REPLACE.
-- Recreate it explicitly so this migration is valid both on fresh installs and existing databases.

drop function if exists market.seller_resource_operations_dashboard();

create function market.seller_resource_operations_dashboard()
returns table(
  id uuid,
  name text,
  kind text,
  active boolean,
  operational_status text,
  current_booking_id uuid,
  current_title text,
  current_starts_at timestamptz,
  current_ends_at timestamptz,
  next_booking_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_ends_at timestamptz,
  overdue_booking_id uuid,
  overdue_title text,
  overdue_ends_at timestamptz,
  maintenance_reason text,
  maintenance_ends_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  with seller_resources as (
    select r.id, r.name, r.kind, r.active
    from market.booking_resources r
    where r.seller_id = market.current_seller_id() or market.is_operator()
  ), status_block as (
    select distinct on (t.resource_id)
      t.resource_id,
      case
        when t.reason='[STATUS] Serwis' then 'service'
        when t.reason='[STATUS] Awaria' then 'failure'
        when t.reason='[STATUS] Blokada' then 'blocked'
        else null
      end as status
    from market.booking_resource_time_off t
    where t.ends_at > now()
      and coalesce(t.reason,'') like '[STATUS] %'
    order by t.resource_id, t.created_at desc
  ), current_booking as (
    select distinct on (b.resource_id)
      b.resource_id, b.id, o.title, b.starts_at, b.ends_at
    from market.bookings b
    join market.offers o on o.id=b.offer_id
    where b.resource_id is not null
      and b.status in ('confirmed','held','pending_payment')
      and b.starts_at <= now()
      and b.ends_at > now()
    order by b.resource_id, b.starts_at desc
  ), next_booking as (
    select distinct on (b.resource_id)
      b.resource_id, b.id, o.title, b.starts_at, b.ends_at
    from market.bookings b
    join market.offers o on o.id=b.offer_id
    where b.resource_id is not null
      and b.status in ('confirmed','held','pending_payment')
      and b.starts_at > now()
    order by b.resource_id, b.starts_at asc
  ), overdue_booking as (
    select distinct on (b.resource_id)
      b.resource_id, b.id, o.title, b.ends_at
    from market.bookings b
    join market.offers o on o.id=b.offer_id
    where b.resource_id is not null
      and b.status='confirmed'
      and b.ends_at <= now()
      and b.ends_at >= now() - interval '7 days'
    order by b.resource_id, b.ends_at desc
  ), maintenance as (
    select distinct on (t.resource_id)
      t.resource_id,
      t.reason,
      t.ends_at
    from market.booking_resource_time_off t
    where t.ends_at > now()
      and coalesce(t.reason,'') not like '[STATUS] %'
      and (
        lower(coalesce(t.reason,'')) like '%serwis%'
        or lower(coalesce(t.reason,'')) like '%napraw%'
        or lower(coalesce(t.reason,'')) like '%przegląd%'
        or lower(coalesce(t.reason,'')) like '%przeglad%'
        or lower(coalesce(t.reason,'')) like '%blokad%'
      )
    order by t.resource_id, t.ends_at asc
  )
  select
    r.id,
    r.name::text,
    r.kind::text,
    r.active,
    case
      when not r.active then 'inactive'
      when sb.status is not null then sb.status
      when cb.id is not null then 'occupied'
      else 'available'
    end::text as operational_status,
    cb.id,
    cb.title::text,
    cb.starts_at,
    cb.ends_at,
    nb.id,
    nb.title::text,
    nb.starts_at,
    nb.ends_at,
    ob.id,
    ob.title::text,
    ob.ends_at,
    m.reason::text,
    m.ends_at
  from seller_resources r
  left join status_block sb on sb.resource_id=r.id
  left join current_booking cb on cb.resource_id=r.id
  left join next_booking nb on nb.resource_id=r.id
  left join overdue_booking ob on ob.resource_id=r.id
  left join maintenance m on m.resource_id=r.id
  order by
    case
      when ob.id is not null then 0
      when not r.active then 7
      when sb.status='failure' then 1
      when sb.status='service' then 2
      when sb.status='blocked' then 3
      when cb.id is not null then 4
      else 5
    end,
    r.kind,
    r.name;
$$;

revoke all on function market.seller_resource_operations_dashboard() from public;
revoke execute on function market.seller_resource_operations_dashboard() from anon;
grant execute on function market.seller_resource_operations_dashboard() to authenticated;
