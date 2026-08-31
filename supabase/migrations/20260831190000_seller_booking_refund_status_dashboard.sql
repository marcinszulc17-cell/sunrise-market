create or replace function market.seller_booking_refund_status_dashboard()
returns table(
  booking_id uuid,
  order_id uuid,
  title text,
  buyer_email text,
  refund_status text,
  amount_gross numeric,
  payment_provider text,
  last_error text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.booking_id,
    r.order_id,
    o.title,
    u.email::text,
    r.status,
    r.amount_gross,
    r.payment_provider,
    r.last_error,
    r.updated_at
  from market.booking_refunds r
  join market.bookings b on b.id = r.booking_id
  join market.offers o on o.id = b.offer_id
  left join auth.users u on u.id = b.buyer_id
  where (b.seller_id = market.current_seller_id() or market.is_operator())
    and r.status in ('preparing','blocked_bonus','payment_failed','finalize_failed')
  order by r.updated_at desc;
$$;

revoke execute on function market.seller_booking_refund_status_dashboard() from public, anon, authenticated;
grant execute on function market.seller_booking_refund_status_dashboard() to authenticated;
