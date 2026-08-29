-- Remove anonymous/public EXECUTE from RPCs that are authenticated-user or operator only.
-- Preserve authenticated and service-role access explicitly.

do $$
declare
  fn regprocedure;
  fns regprocedure[] := array[
    'market.add_review_simple(uuid,integer,text)'::regprocedure,
    'market.admin_breakdown()'::regprocedure,
    'market.admin_customers(text,integer)'::regprocedure,
    'market.admin_order_items(uuid)'::regprocedure,
    'market.admin_orders(text,text,integer)'::regprocedure,
    'market.admin_overview()'::regprocedure,
    'market.admin_sellers(text,integer)'::regprocedure,
    'market.admin_set_seller_status(uuid,text)'::regprocedure,
    'market.ami_operator()'::regprocedure,
    'market.become_seller(text,text,boolean)'::regprocedure,
    'market.become_seller(text,text)'::regprocedure,
    'market.bridge_queue()'::regprocedure,
    'market.confirm_delivery(uuid)'::regprocedure,
    'market.create_offer(text,text,numeric,integer,text,text)'::regprocedure,
    'market.create_offer_v2(text,text,numeric,integer,text,text[],text,jsonb)'::regprocedure,
    'market.get_auto_forward()'::regprocedure,
    'market.is_operator()'::regprocedure,
    'market.is_smart_member(uuid)'::regprocedure,
    'market.list_bridge_orders()'::regprocedure,
    'market.list_offers_admin()'::regprocedure,
    'market.list_pending_sellers()'::regprocedure,
    'market.list_returns()'::regprocedure,
    'market.mark_notifications_read()'::regprocedure,
    'market.mark_shipped(uuid)'::regprocedure,
    'market.moderate_offer(uuid,boolean)'::regprocedure,
    'market.my_balance()'::regprocedure,
    'market.my_notifications()'::regprocedure,
    'market.my_offers()'::regprocedure,
    'market.my_promote_offer(uuid,integer)'::regprocedure,
    'market.my_returns()'::regprocedure,
    'market.my_seller_balance()'::regprocedure,
    'market.my_subscription()'::regprocedure,
    'market.open_return(uuid,text)'::regprocedure,
    'market.operator_console()'::regprocedure,
    'market.recommended_offers(integer)'::regprocedure,
    'market.review_seller(uuid,boolean)'::regprocedure,
    'market.seller_summary()'::regprocedure,
    'market.track_view(uuid)'::regprocedure,
    'market.wallet_history()'::regprocedure
  ];
begin
  foreach fn in array fns loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- Public-schema wrappers below are intentionally authenticated-only.
revoke execute on function public.buyer_pref_categories(uuid,integer) from public, anon;
grant execute on function public.buyer_pref_categories(uuid,integer) to authenticated, service_role;

revoke execute on function public.operator_fulfillment_queue() from public, anon;
grant execute on function public.operator_fulfillment_queue() to authenticated, service_role;

revoke execute on function public.recommended_offers(integer) from public, anon;
grant execute on function public.recommended_offers(integer) to authenticated, service_role;

revoke execute on function public.seller_fulfillment_queue() from public, anon;
grant execute on function public.seller_fulfillment_queue() to authenticated, service_role;

revoke execute on function public.set_fulfillment_status(uuid,text,text) from public, anon;
grant execute on function public.set_fulfillment_status(uuid,text,text) to authenticated, service_role;

revoke execute on function public.track_view(uuid) from public, anon;
grant execute on function public.track_view(uuid) to authenticated, service_role;
