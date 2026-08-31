-- Keep internal helpers out of PostgREST client roles.
revoke all on function market._auto_forward_on() from public;
revoke execute on function market._auto_forward_on() from anon, authenticated;

revoke all on function market.trg_order_paid_fulfillment() from public;
revoke execute on function market.trg_order_paid_fulfillment() from anon, authenticated;

-- Verification automation callbacks are invoked only by trusted server-side automation.
revoke all on function market.mark_verification_processing(uuid,jsonb) from public;
revoke execute on function market.mark_verification_processing(uuid,jsonb) from anon, authenticated;
grant execute on function market.mark_verification_processing(uuid,jsonb) to service_role;

revoke all on function market.finish_verification_automation(uuid,jsonb,jsonb) from public;
revoke execute on function market.finish_verification_automation(uuid,jsonb,jsonb) from anon, authenticated;
grant execute on function market.finish_verification_automation(uuid,jsonb,jsonb) to service_role;

revoke all on function market.fail_verification_automation(uuid,text,jsonb) from public;
revoke execute on function market.fail_verification_automation(uuid,text,jsonb) from anon, authenticated;
grant execute on function market.fail_verification_automation(uuid,text,jsonb) to service_role;

-- Operator RPCs stay callable by signed-in users, with operator checks enforced inside the functions.
revoke all on function market.operator_complete_verification(uuid,jsonb,text,text) from public;
revoke execute on function market.operator_complete_verification(uuid,jsonb,text,text) from anon;
grant execute on function market.operator_complete_verification(uuid,jsonb,text,text) to authenticated;

revoke all on function market.operator_verification_requests() from public;
revoke execute on function market.operator_verification_requests() from anon;
grant execute on function market.operator_verification_requests() to authenticated;
