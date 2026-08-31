create index if not exists booking_blocks_seller_idx
  on market.booking_blocks(seller_id);

create index if not exists booking_services_seller_idx
  on market.booking_services(seller_id);

create index if not exists booking_change_audit_old_resource_idx
  on market.booking_change_audit(old_resource_id);

create index if not exists booking_change_audit_new_resource_idx
  on market.booking_change_audit(new_resource_id);
