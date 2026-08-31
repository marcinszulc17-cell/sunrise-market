revoke execute on function market.seller_booking_catalog_v2(uuid) from public, anon;
revoke execute on function market.seller_booking_rate_delete(uuid,uuid) from public, anon;
revoke execute on function market.seller_booking_rate_upsert(uuid,uuid,date,date,numeric,integer,text,integer,boolean) from public, anon;
revoke execute on function market.seller_booking_resource_unlink(uuid,uuid) from public, anon;
revoke execute on function market.seller_booking_resource_upsert(uuid,uuid,text,text,text,boolean) from public, anon;
revoke execute on function market.seller_booking_save_extras(uuid,integer,integer,numeric,numeric,boolean) from public, anon;
revoke execute on function market.seller_booking_service_delete(uuid,uuid) from public, anon;
revoke execute on function market.seller_booking_service_upsert(uuid,uuid,text,text,integer,numeric,integer,integer,boolean) from public, anon;
revoke execute on function market.create_booking_hold_v2(uuid,timestamptz,timestamptz,uuid,uuid) from public, anon;

grant execute on function market.seller_booking_catalog_v2(uuid) to authenticated;
grant execute on function market.seller_booking_rate_delete(uuid,uuid) to authenticated;
grant execute on function market.seller_booking_rate_upsert(uuid,uuid,date,date,numeric,integer,text,integer,boolean) to authenticated;
grant execute on function market.seller_booking_resource_unlink(uuid,uuid) to authenticated;
grant execute on function market.seller_booking_resource_upsert(uuid,uuid,text,text,text,boolean) to authenticated;
grant execute on function market.seller_booking_save_extras(uuid,integer,integer,numeric,numeric,boolean) to authenticated;
grant execute on function market.seller_booking_service_delete(uuid,uuid) to authenticated;
grant execute on function market.seller_booking_service_upsert(uuid,uuid,text,text,integer,numeric,integer,integer,boolean) to authenticated;
grant execute on function market.create_booking_hold_v2(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated;
