create or replace function market.apply_sunrise_pay_fee(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'market', 'public'
as $$
begin
  update market.order_items
  set commission_rate = 0.079,
      commission_amount = round(coalesce(line_gross, unit_price_gross * qty) * 0.079, 2),
      seller_payout = round(coalesce(line_gross, unit_price_gross * qty) * 0.921, 2)
  where order_id = p_order_id;
end;
$$;

create or replace function market.apply_stripe_seller_fee(p_order_id uuid)
returns void
language sql
set search_path to ''
as $$
  update market.order_items
  set commission_rate = 0.129,
      commission_amount = round(coalesce(line_gross, unit_price_gross * qty) * 0.129, 2),
      seller_payout = round(coalesce(line_gross, unit_price_gross * qty) * 0.871, 2)
  where order_id = p_order_id;
$$;
