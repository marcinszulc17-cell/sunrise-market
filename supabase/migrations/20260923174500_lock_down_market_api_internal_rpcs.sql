-- Internal RPCs used by the market-api Edge Function must never be callable
-- directly from anon/authenticated roles. market-api authenticates seller API keys
-- and calls these RPCs with service_role.

revoke all on function market.api_klucz(text) from public, anon, authenticated;
revoke all on function market.api_kategorie() from public, anon, authenticated;
revoke all on function market.api_oferty(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function market.api_zamowienia(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function market.api_wyslano(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function market.api_zapisz_oferte(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function market.api_zapisz_oferty(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function market.api_zapisz_zapytanie(uuid, text, text, integer, integer) from public, anon, authenticated;

grant execute on function market.api_klucz(text) to service_role;
grant execute on function market.api_kategorie() to service_role;
grant execute on function market.api_oferty(uuid, integer, timestamptz) to service_role;
grant execute on function market.api_zamowienia(uuid, timestamptz, integer) to service_role;
grant execute on function market.api_wyslano(uuid, uuid, text, text) to service_role;
grant execute on function market.api_zapisz_oferte(uuid, integer, jsonb) to service_role;
grant execute on function market.api_zapisz_oferty(uuid, integer, jsonb) to service_role;
grant execute on function market.api_zapisz_zapytanie(uuid, text, text, integer, integer) to service_role;

-- Seller key management remains available to signed-in sellers only.
revoke all on function market.utworz_klucz_api(text, integer) from public, anon;
revoke all on function market.odwolaj_klucz_api(uuid) from public, anon;
grant execute on function market.utworz_klucz_api(text, integer) to authenticated, service_role;
grant execute on function market.odwolaj_klucz_api(uuid) to authenticated, service_role;
