-- Booking hold creation already requires auth.uid() in the function body.
-- Remove unnecessary anon/PUBLIC EXECUTE and expose only to signed-in users.

revoke execute on function market.create_booking_hold(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function market.create_booking_hold_v2(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon;
revoke execute on function market.create_booking_hold_v3(uuid, timestamptz, timestamptz, uuid, uuid, integer) from public, anon;
revoke execute on function market.create_booking_hold_v4(uuid, timestamptz, timestamptz, uuid, uuid, integer, boolean) from public, anon;

grant execute on function market.create_booking_hold(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function market.create_booking_hold_v2(uuid, timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;
grant execute on function market.create_booking_hold_v3(uuid, timestamptz, timestamptz, uuid, uuid, integer) to authenticated, service_role;
grant execute on function market.create_booking_hold_v4(uuid, timestamptz, timestamptz, uuid, uuid, integer, boolean) to authenticated, service_role;
