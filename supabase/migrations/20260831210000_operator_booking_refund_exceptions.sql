-- Read-only operator queue for paid booking refunds that need intervention.
create or replace function market.operator_booking_refund_exceptions()
returns table(
  booking_id uuid,
  order_id uuid,
  refund_status text,
  amount_gross numeric,
  payment_provider text,
  external_ref text,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz,
  refunded_at timestamptz,
  booking_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  offer_title text,
  seller_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not market.is_operator() then
    raise exception 'Brak uprawnień operatora';
  end if;

  return query
  select
    r.booking_id,
    r.order_id,
    r.status,
    r.amount_gross,
    r.payment_provider,
    r.external_ref,
    r.last_error,
    r.created_at,
    r.updated_at,
    r.refunded_at,
    b.status,
    b.starts_at,
    b.ends_at,
    o.title,
    s.email
  from market.booking_refunds r
  join market.bookings b on b.id = r.booking_id
  left join market.offers o on o.id = b.offer_id
  left join market.sellers s on s.id = b.seller_id
  where r.status in ('blocked_bonus','payment_failed','finalize_failed')
     or (r.status = 'preparing' and r.updated_at < now() - interval '15 minutes')
  order by r.updated_at desc
  limit 500;
end;
$$;

revoke all on function market.operator_booking_refund_exceptions() from public;
grant execute on function market.operator_booking_refund_exceptions() to authenticated;