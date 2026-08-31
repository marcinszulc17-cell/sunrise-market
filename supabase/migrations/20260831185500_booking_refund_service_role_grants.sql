-- booking_refund_finalize performs the privileged state transition only after
-- the payment provider has successfully returned the customer's money.
-- It must not be callable by browser roles, but the Edge Function service role
-- needs EXECUTE after PUBLIC privileges were revoked in the base refund migration.

revoke execute on function market.booking_refund_finalize(uuid,text) from public;
revoke execute on function market.booking_refund_finalize(uuid,text) from anon;
revoke execute on function market.booking_refund_finalize(uuid,text) from authenticated;
grant execute on function market.booking_refund_finalize(uuid,text) to service_role;
