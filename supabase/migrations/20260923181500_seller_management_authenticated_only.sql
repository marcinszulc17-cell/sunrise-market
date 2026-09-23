-- Seller management RPCs are only for signed-in sellers.

revoke execute on function market.seller_booking_save_stay(uuid, integer, time, time, text[]) from public, anon;
revoke execute on function market.seller_booking_save_stay_v2(uuid, integer, time, time, text[], integer, integer, jsonb, numeric, time, time, boolean, boolean, boolean, boolean, text, text) from public, anon;
revoke execute on function market.seller_booking_set_cancellation_policy(uuid, text) from public, anon;
revoke execute on function market.seller_booking_set_location(uuid, numeric, numeric, text) from public, anon;
revoke execute on function market.seller_booking_set_price_mode(uuid, text) from public, anon;
revoke execute on function market.seller_booking_set_stay_fees(uuid, numeric, numeric, integer, numeric) from public, anon;
revoke execute on function market.set_pickup_settings(boolean, text, text, text) from public, anon;

grant execute on function market.seller_booking_save_stay(uuid, integer, time, time, text[]) to authenticated, service_role;
grant execute on function market.seller_booking_save_stay_v2(uuid, integer, time, time, text[], integer, integer, jsonb, numeric, time, time, boolean, boolean, boolean, boolean, text, text) to authenticated, service_role;
grant execute on function market.seller_booking_set_cancellation_policy(uuid, text) to authenticated, service_role;
grant execute on function market.seller_booking_set_location(uuid, numeric, numeric, text) to authenticated, service_role;
grant execute on function market.seller_booking_set_price_mode(uuid, text) to authenticated, service_role;
grant execute on function market.seller_booking_set_stay_fees(uuid, numeric, numeric, integer, numeric) to authenticated, service_role;
grant execute on function market.set_pickup_settings(boolean, text, text, text) to authenticated, service_role;
