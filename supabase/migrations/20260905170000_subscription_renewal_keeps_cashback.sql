-- Cashback przy każdej płatności (decyzja właściciela 2026-09-05): odnowienie subskrypcji zachowuje
-- cashback_amount policzony przez market.checkout; stripe-webhook nalicza punkty po invoice.paid.
-- (Wcześniejsza wersja zerowała cashback_amount przy odnowieniu.)
create or replace function market.create_subscription_renewal_order(p_stripe_subscription_id text, p_invoice_id text)
returns uuid language plpgsql security definer set search_path to 'market','public','extensions' as $$
declare v_buyer uuid; v_items jsonb := '[]'::jsonb; v_order uuid; r record;
begin
  select id into v_order from market.orders where stripe_session_id = 'inv:'||p_invoice_id limit 1;
  if v_order is not null then return v_order; end if;
  for r in select ps.buyer_id, ps.offer_id, ps.qty from market.product_subscriptions ps
           where ps.stripe_subscription_id = p_stripe_subscription_id and ps.status = 'active'
  loop
    v_buyer := r.buyer_id;
    v_items := v_items || jsonb_build_object('offer_id', r.offer_id, 'qty', r.qty);
  end loop;
  if v_buyer is null or jsonb_array_length(v_items) = 0 then return null; end if;
  v_order := market.checkout(v_buyer, v_items);
  update market.orders set payment_provider = 'stripe', stripe_session_id = 'inv:'||p_invoice_id, status = 'paid' where id = v_order;
  update market.product_subscriptions set last_invoice_id = p_invoice_id, last_renewed_at = now(), next_run = current_date + 30
    where stripe_subscription_id = p_stripe_subscription_id and status = 'active';
  return v_order;
end; $$;
revoke all on function market.create_subscription_renewal_order(text, text) from public;
