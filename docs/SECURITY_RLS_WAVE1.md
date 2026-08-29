# RLS hardening wave 1

Applied to production on 2026-08-29.

Protected tables:
- market.verification_requests
- market.offer_leads
- market.orders
- market.buyers
- market.returns
- market.disputes
- market.cashback_ledger
- market.sellers

For these tables direct anon/authenticated DML is revoked. Application access remains through SECURITY DEFINER RPCs and service-role Edge Functions.

RPC grants tightened:
- my_offer_leads: authenticated only
- my_orders: authenticated only
- my_seller: authenticated only
- request_sale_confirmation: authenticated only
- seller_orders: authenticated only
- set_offer_lead_status: authenticated only

The generic lead status RPC no longer permits sold_confirmed. Buyer confirmation remains the only supported transition from sold_declared to sold_confirmed.

Remaining audit work:
- additional market tables still have RLS disabled
- selected public SECURITY DEFINER functions still require grant review
- leaked-password protection remains disabled in Supabase Auth
- mutable search_path warnings remain on selected functions
