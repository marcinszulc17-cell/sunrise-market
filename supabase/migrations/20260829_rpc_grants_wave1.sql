-- Restrict authenticated-only SECURITY DEFINER RPCs.
-- Public buyer-facing confirmation and lead creation RPCs remain anonymous by design.

revoke execute on function market.my_offer_leads() from public, anon;
grant execute on function market.my_offer_leads() to authenticated;

revoke execute on function market.my_orders() from public, anon;
grant execute on function market.my_orders() to authenticated;

revoke execute on function market.my_seller() from public, anon;
grant execute on function market.my_seller() to authenticated;

revoke execute on function market.request_sale_confirmation(uuid) from public, anon;
grant execute on function market.request_sale_confirmation(uuid) to authenticated;

revoke execute on function market.seller_orders() from public, anon;
grant execute on function market.seller_orders() to authenticated;
