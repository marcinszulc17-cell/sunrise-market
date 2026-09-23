-- Mirrors production hardening applied 2026-09-23.
-- Public reference tables remain read-only for anon/authenticated.
-- Internal configuration tables are protected by RLS without client policies.

alter table market.categories enable row level security;
alter table market.category_attributes enable row level security;
alter table market.shipping_methods enable row level security;
alter table market.offer_variants enable row level security;
alter table market.partner_program_config enable row level security;
alter table market.partner_membership_renewals enable row level security;
alter table market.service_cities enable row level security;
alter table market.shipping_zones enable row level security;
alter table market.tematy_lokalne enable row level security;
alter table market.mapa_lokalna enable row level security;

drop policy if exists categories_public_read on market.categories;
create policy categories_public_read
on market.categories for select
to anon, authenticated
using (true);

drop policy if exists category_attributes_public_read on market.category_attributes;
create policy category_attributes_public_read
on market.category_attributes for select
to anon, authenticated
using (true);

drop policy if exists shipping_methods_public_read on market.shipping_methods;
create policy shipping_methods_public_read
on market.shipping_methods for select
to anon, authenticated
using (true);

drop policy if exists offer_variants_public_read on market.offer_variants;
create policy offer_variants_public_read
on market.offer_variants for select
to anon, authenticated
using (true);

drop policy if exists service_cities_public_read on market.service_cities;
create policy service_cities_public_read
on market.service_cities for select
to anon, authenticated
using (true);

drop policy if exists mapa_lokalna_public_read on market.mapa_lokalna;
create policy mapa_lokalna_public_read
on market.mapa_lokalna for select
to anon, authenticated
using (true);

alter function market.atrybuty_publiczne(jsonb) set search_path = pg_catalog, market;
alter function market.grupa_powiadomienia(text) set search_path = pg_catalog, market;
alter function market.nip_poprawny(text) set search_path = pg_catalog, market;
alter function market.nazwa_rdzen(text) set search_path = pg_catalog, market;
alter function market.komorka_pl(text) set search_path = pg_catalog, market;
alter function market.bez_ogonkow(text) set search_path = pg_catalog, market;
alter function market.ma_kontakt(text) set search_path = pg_catalog, market;

revoke all on function public.claim_enrich_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_enrich_batch(integer) to service_role;
