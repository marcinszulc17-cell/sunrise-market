# Security audit — 2026-08-29

Supabase advisor currently reports many tables in schema `market` with Row Level Security disabled. This must be hardened deliberately with per-table policies because enabling RLS globally without policies would break existing client and RPC flows.

Immediate actions completed in this change set:
- public `get_offer` no longer returns VIN, registration number, KW number or internal purchase/commission flags;
- public `search_offers_v2` no longer returns those sensitive keys;
- legacy mileage filtering now accepts both `mileage_km` and `mileage`;
- Sunrise Verify payment/status Edge Functions require a valid JWT and enforce request ownership.

Next security pass:
- inventory every client-side direct table access;
- prepare policies per table;
- enable RLS in small verified batches;
- restrict SECURITY DEFINER RPC execution grants to intended roles;
- remove or lock down diagnostic/admin RPCs exposed to anon;
- enable leaked-password protection in Supabase Auth.
