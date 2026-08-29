create or replace function market.apply_sunrise_pay_fee(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = market, public
as $$
begin
  update market.order_items
  set commission_rate = 0.079,
      commission_amount = round((unit_price_gross * qty) * 0.079, 2),
      seller_payout = round((unit_price_gross * qty) * 0.921, 2)
  where order_id = p_order_id;
end;
$$;

revoke all on function market.apply_sunrise_pay_fee(uuid) from public, anon, authenticated;
grant execute on function market.apply_sunrise_pay_fee(uuid) to service_role;
