revoke all on function market.private_partner_set_fulfillment(uuid,text,text) from public, anon;
grant execute on function market.private_partner_set_fulfillment(uuid,text,text) to authenticated, service_role;
