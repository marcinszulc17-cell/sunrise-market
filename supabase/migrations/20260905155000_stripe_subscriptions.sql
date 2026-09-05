-- Subskrypcje cykliczne (decyzja właściciela 2026-09-05): miesięczne, płatne z góry, z ciągłością,
-- rozliczane wyłącznie przez Stripe (CLAUDE.md §1). Oferta z attributes.subscription trafia do Stripe
-- Checkout w trybie subscription; każdy kolejny opłacony invoice (billing_reason=subscription_cycle)
-- tworzy w Market nowe, opłacone zamówienie (prowizja, wypłata sprzedawcy, powiadomienia — jak przy zakupie).
alter table market.product_subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists source_order_id uuid references market.orders(id) on delete set null,
  add column if not exists last_invoice_id text,
  add column if not exists last_renewed_at timestamptz,
  add column if not exists canceled_at timestamptz;
create unique index if not exists product_subscriptions_stripe_offer_uq
  on market.product_subscriptions (stripe_subscription_id, offer_id) where stripe_subscription_id is not null;

-- Po opłaceniu pierwszej sesji: zapisujemy subskrypcję dla każdej pozycji abonamentowej zamówienia.
create or replace function market.register_stripe_subscription(p_order uuid, p_stripe_subscription_id text, p_stripe_customer_id text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int := 0; r record; v_buyer uuid;
begin
  select buyer_id into v_buyer from market.orders where id = p_order;
  if v_buyer is null or coalesce(p_stripe_subscription_id,'') = '' then return 0; end if;
  for r in
    select oi.offer_id, oi.qty from market.order_items oi join market.offers o on o.id = oi.offer_id
    where oi.order_id = p_order and o.attributes ? 'subscription'
  loop
    insert into market.product_subscriptions(buyer_id, offer_id, qty, interval_days, next_run, status, stripe_subscription_id, stripe_customer_id, source_order_id, last_renewed_at)
    values (v_buyer, r.offer_id, r.qty, 30, current_date + 30, 'active', p_stripe_subscription_id, p_stripe_customer_id, p_order, now())
    on conflict (stripe_subscription_id, offer_id) where stripe_subscription_id is not null do update
      set status = 'active', qty = excluded.qty, stripe_customer_id = coalesce(excluded.stripe_customer_id, market.product_subscriptions.stripe_customer_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function market.register_stripe_subscription(uuid, text, text) from public;

-- Odnowienie: nowe opłacone zamówienie z pozycji subskrypcji. Idempotentne per invoice.
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
  update market.orders set payment_provider = 'stripe', stripe_session_id = 'inv:'||p_invoice_id, cashback_amount = 0, status = 'paid' where id = v_order;
  update market.product_subscriptions set last_invoice_id = p_invoice_id, last_renewed_at = now(), next_run = current_date + 30
    where stripe_subscription_id = p_stripe_subscription_id and status = 'active';
  return v_order;
end; $$;
revoke all on function market.create_subscription_renewal_order(text, text) from public;

create or replace function market.cancel_stripe_subscription(p_stripe_subscription_id text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update market.product_subscriptions set status = 'canceled', canceled_at = now()
    where stripe_subscription_id = p_stripe_subscription_id and status <> 'canceled';
  get diagnostics v_n = row_count; return v_n;
end; $$;
revoke all on function market.cancel_stripe_subscription(text) from public;

-- Klient: moje subskrypcje (zakładka Zamówienia).
create or replace function market.my_subscriptions()
returns table(id uuid, offer_id uuid, title text, qty integer, status text, price_gross numeric, next_run date, last_renewed_at timestamptz, canceled_at timestamptz, stripe_subscription_id text)
language sql stable security definer set search_path = '' as $$
  select ps.id, ps.offer_id, o.title, ps.qty, ps.status, o.price_gross, ps.next_run, ps.last_renewed_at, ps.canceled_at, ps.stripe_subscription_id
  from market.product_subscriptions ps join market.offers o on o.id = ps.offer_id
  where ps.buyer_id = auth.uid() order by ps.created_at desc;
$$;
grant execute on function market.my_subscriptions() to authenticated;
