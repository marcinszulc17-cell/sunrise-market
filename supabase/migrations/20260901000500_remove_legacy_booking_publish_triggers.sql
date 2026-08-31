-- #236 and #238 both landed. Keep only the safer #238 lifecycle, which uses
-- attributes.booking_setup_pending to distinguish a newly auto-paused booking
-- offer from an offer the seller deliberately hides later.

-- Old #236 trigger could republish any paused booking offer when booking.active
-- changes back to true, including an offer intentionally hidden by the seller.
drop trigger if exists booking_offer_publish_on_activation_trg on market.booking_offers;
drop trigger if exists booking_offer_hide_until_setup_trg on market.offers;

drop function if exists market.publish_booking_offer_on_activation();
drop function if exists market.prepare_booking_offer_visibility();

-- The canonical #238 trigger must remain installed:
-- booking_setup_offer_visibility_trg -> market.sync_booking_setup_offer_visibility().
