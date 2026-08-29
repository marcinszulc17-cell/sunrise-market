-- Sunrise Verify MVP database changes
alter table market.verification_requests add column if not exists stripe_session_id text unique;
alter table market.verification_requests add column if not exists paid_at timestamptz;
alter table market.verification_requests add column if not exists report_ready_at timestamptz;
alter table market.verification_requests add column if not exists error_message text;

-- Public offer RPCs must not expose sensitive identifiers.
-- Production definitions were updated in Supabase; keep future schema work aligned with this rule:
-- remove vin, registration_number, kw_number, offer_type, cashback_only and purchase_mode
-- from public attributes returned by get_offer/search_offers_v2.
