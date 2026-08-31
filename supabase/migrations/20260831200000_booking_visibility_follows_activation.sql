-- Keep public offer visibility aligned with booking activation.
-- Booking offers are visible only while their booking configuration is active.
-- Regular purchase offers and blocked/archived offers are not touched.

create or replace function market.sync_booking_offer_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update market.offers o
  set status = case when new.active then 'active' else 'paused' end,
      updated_at = now()
  where o.id = new.offer_id
    and o.seller_id = new.seller_id
    and o.status in ('active', 'paused')
    and coalesce(o.attributes ->> 'purchase_mode', '') in ('appointment', 'daily');

  return new;
end;
$$;

revoke all on function market.sync_booking_offer_visibility() from public, anon, authenticated;
grant execute on function market.sync_booking_offer_visibility() to service_role;

drop trigger if exists trg_booking_offer_visibility on market.booking_offers;
create trigger trg_booking_offer_visibility
after insert or update of active on market.booking_offers
for each row
execute function market.sync_booking_offer_visibility();
