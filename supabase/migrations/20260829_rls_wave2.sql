-- Second RLS hardening wave for backend-only Market tables and RPCs.
-- Service-role Edge Functions and table owners continue to work; no FORCE RLS is used.

-- Preserve wave 1 identity/transaction protection.
alter table market.orders enable row level security;
alter table market.buyers enable row level security;
alter table market.returns enable row level security;
alter table market.disputes enable row level security;
alter table market.cashback_ledger enable row level security;
alter table market.sellers enable row level security;
revoke all on table market.orders, market.buyers, market.returns, market.disputes, market.cashback_ledger, market.sellers from anon, authenticated;

-- Backend/integration tables: never expose rows directly through PostgREST.
alter table market.ad_slots enable row level security;
alter table market.banner_campaigns enable row level security;
alter table market.cj_pull_cursor enable row level security;
alter table market.eprolo_product_map enable row level security;
alter table market.eprolo_pull_cursor enable row level security;
alter table market.kyc_submissions enable row level security;
alter table market.moderation_queue enable row level security;
alter table market.offer_embeddings enable row level security;
alter table market.offer_images enable row level security;
alter table market.offer_questions enable row level security;
alter table market.operators enable row level security;
alter table market.pay_subscriptions enable row level security;
alter table market.photo_enhancements enable row level security;
alter table market.photo_ops enable row level security;
alter table market.platform_config enable row level security;
alter table market.product_subscriptions enable row level security;
alter table market.promo_pricing enable row level security;
alter table market.promoted_offers enable row level security;
alter table market.reviews enable row level security;
alter table market.seller_contexts enable row level security;
alter table market.seller_studio_integration enable row level security;
alter table market.shipments enable row level security;
alter table market.shipping_settings enable row level security;
alter table market.studio_invoice_requests enable row level security;
alter table market.suri_messages enable row level security;
alter table market.suri_sessions enable row level security;
alter table market.td_pull_cursor enable row level security;
alter table market.teemdrop_bridge_orders enable row level security;
alter table market.teemdrop_product_map enable row level security;
alter table market.watchlist enable row level security;

revoke all on table market.ad_slots, market.banner_campaigns, market.cj_pull_cursor,
  market.eprolo_product_map, market.eprolo_pull_cursor, market.kyc_submissions,
  market.moderation_queue, market.offer_embeddings, market.offer_images,
  market.offer_questions, market.operators, market.pay_subscriptions,
  market.photo_enhancements, market.photo_ops, market.platform_config,
  market.product_subscriptions, market.promo_pricing, market.promoted_offers,
  market.reviews, market.seller_contexts, market.seller_studio_integration,
  market.shipments, market.shipping_settings, market.studio_invoice_requests,
  market.suri_messages, market.suri_sessions, market.td_pull_cursor,
  market.teemdrop_bridge_orders, market.teemdrop_product_map, market.watchlist
from anon, authenticated;

-- Trigger helper must not be callable as a public RPC.
revoke execute on function public.auto_confirm_user() from public, anon, authenticated;

-- Fulfillment queues/status are signed-in workflows only.
revoke execute on function public.operator_fulfillment_queue() from public, anon;
grant execute on function public.operator_fulfillment_queue() to authenticated;
revoke execute on function public.seller_fulfillment_queue() from public, anon;
grant execute on function public.seller_fulfillment_queue() to authenticated;
revoke execute on function public.set_fulfillment_status(uuid,text,text) from public, anon;
grant execute on function public.set_fulfillment_status(uuid,text,text) to authenticated;

-- Personalized recommendations and tracking require a signed-in user.
revoke execute on function public.recommended_offers(integer) from public, anon;
grant execute on function public.recommended_offers(integer) to authenticated;
revoke execute on function public.track_view(uuid) from public, anon;
grant execute on function public.track_view(uuid) to authenticated;

-- Internal AI taxonomy bridge and auth lookup are not browser RPCs.
revoke execute on function public.tt_leaf_categories() from public, anon, authenticated;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;

-- Prevent one signed-in user from querying another buyer's preferences.
create or replace function public.buyer_pref_categories(p_user uuid, p_limit integer)
returns table(name text)
language sql
stable security definer
set search_path to 'public','market'
as $$
  select c.name
  from market.orders o
  join market.order_items oi on oi.order_id = o.id
  join market.offers of2 on of2.id = oi.offer_id
  join market.categories c on c.id = of2.category_id
  where auth.uid() is not null
    and p_user = auth.uid()
    and o.buyer_id = auth.uid()
  group by c.name
  order by max(o.created_at) desc
  limit greatest(1, least(coalesce(p_limit,5), 10));
$$;
revoke execute on function public.buyer_pref_categories(uuid,integer) from public, anon;
grant execute on function public.buyer_pref_categories(uuid,integer) to authenticated;

-- Fix mutable search_path warnings on Market helper functions.
alter function market.brand_label(text) set search_path = 'market','public';
alter function market.enforce_price_before_activate() set search_path = 'market','public';
alter function market.offers_autoflag_test() set search_path = 'market','public';
alter function market.set_partner_subscription_defaults() set search_path = 'market','public';
