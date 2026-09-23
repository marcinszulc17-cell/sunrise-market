-- Trigger functions are backend implementation details, not browser RPCs.

revoke all on function market.flaga_firmy_na_oferty() from public, anon, authenticated;
revoke all on function market.log_fulfillment_paid_event() from public, anon, authenticated;
revoke all on function market.oznacz_oferte() from public, anon, authenticated;
revoke all on function market.sprawdz_oferte() from public, anon, authenticated;
revoke all on function market.sprzedawca_do_weryfikacji() from public, anon, authenticated;

grant execute on function market.flaga_firmy_na_oferty() to service_role;
grant execute on function market.log_fulfillment_paid_event() to service_role;
grant execute on function market.oznacz_oferte() to service_role;
grant execute on function market.sprawdz_oferte() to service_role;
grant execute on function market.sprzedawca_do_weryfikacji() to service_role;
