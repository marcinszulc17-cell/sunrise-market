-- #248 landed after the safer booking_setup_pending lifecycle. Remove its
-- unconditional active/paused synchronizer: reactivating booking must not
-- republish an offer the seller deliberately hid.

drop trigger if exists trg_booking_offer_visibility on market.booking_offers;
drop function if exists market.sync_booking_offer_visibility();

-- Canonical lifecycle remains:
-- booking_setup_offer_visibility_trg -> sync_booking_setup_offer_visibility().
