revoke all on function market.sms_tick() from public, anon, authenticated;
grant execute on function market.sms_tick() to service_role;
