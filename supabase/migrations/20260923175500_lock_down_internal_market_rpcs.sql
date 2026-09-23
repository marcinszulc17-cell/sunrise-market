-- Backend-only RPCs and trigger functions must not be callable by browser roles.

revoke all on function market.enqueue_sms(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function market.booking_refund_finalize_partial(uuid, text, numeric) from public, anon, authenticated;
revoke all on function market.odswiez_mape_lokalna() from public, anon, authenticated;
revoke all on function market.weryfikacja_firm_tick() from public, anon, authenticated;
revoke all on function market.zapytaj_o_nip(uuid) from public, anon, authenticated;
revoke all on function market.trg_order_paid_notifications() from public, anon, authenticated;
revoke all on function market.trg_sync_order_status_from_fulfillment() from public, anon, authenticated;
revoke all on function market.enqueue_base_bridge() from public, anon, authenticated;

grant execute on function market.enqueue_sms(uuid, text, text, text, text) to service_role;
grant execute on function market.booking_refund_finalize_partial(uuid, text, numeric) to service_role;
grant execute on function market.odswiez_mape_lokalna() to service_role;
grant execute on function market.weryfikacja_firm_tick() to service_role;
grant execute on function market.zapytaj_o_nip(uuid) to service_role;
grant execute on function market.trg_order_paid_notifications() to service_role;
grant execute on function market.trg_sync_order_status_from_fulfillment() to service_role;
grant execute on function market.enqueue_base_bridge() to service_role;
