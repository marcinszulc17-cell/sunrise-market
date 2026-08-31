create index if not exists booking_offer_resources_resource_idx
  on market.booking_offer_resources(resource_id);

create index if not exists booking_service_resources_resource_idx
  on market.booking_service_resources(resource_id);
