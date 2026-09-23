-- Background/system RPCs are not user-facing endpoints.
-- Cron and trigger execution runs with privileged database roles; browser roles must not call them directly.

revoke all on function market.sms_tick() from public, anon, authenticated;
revoke all on function market.weryfikacja_firm_tick() from public, anon, authenticated;
revoke all on function market.zapytaj_o_nip(uuid) from public, anon, authenticated;

grant execute on function market.sms_tick() to service_role;
grant execute on function market.weryfikacja_firm_tick() to service_role;
grant execute on function market.zapytaj_o_nip(uuid) to service_role;
