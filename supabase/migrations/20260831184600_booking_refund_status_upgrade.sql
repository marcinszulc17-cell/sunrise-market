-- Upgrade live booking_refunds created during staged rollout.
-- CREATE TABLE IF NOT EXISTS in the previous migration does not replace an existing CHECK constraint.

alter table market.booking_refunds
  drop constraint if exists booking_refunds_status_check;

alter table market.booking_refunds
  add constraint booking_refunds_status_check
  check (status in ('preparing','blocked_bonus','payment_failed','refunded','finalize_failed'));