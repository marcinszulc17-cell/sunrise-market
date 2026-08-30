create or replace function market.apply_stripe_seller_fee(p_order_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update market.order_items
  set commission_rate = 0.129,
      commission_amount = round((unit_price_gross * qty) * 0.129, 2),
      seller_payout = round((unit_price_gross * qty) * 0.871, 2)
  where order_id = p_order_id;
$$;

revoke all on function market.apply_stripe_seller_fee(uuid) from public, anon, authenticated;
grant execute on function market.apply_stripe_seller_fee(uuid) to service_role;
