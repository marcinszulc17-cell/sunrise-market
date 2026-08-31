import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831194500_paid_booking_refund_flow.sql", import.meta.url), "utf8");
const refundFn = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");

test("direct seller cancellation blocks paid bookings", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("paid booking refund reverses bonuses before returning money", () => {
  const reverseAt = refundFn.indexOf('bridge("reverse", orderId)');
  const sunriseRefundAt = refundFn.indexOf('booking-full-refund:${bookingId}');
  const stripeRefundAt = refundFn.indexOf('stripe.refunds.create');
  assert.ok(reverseAt >= 0);
  assert.ok(sunriseRefundAt > reverseAt);
  assert.ok(stripeRefundAt > reverseAt);
});

test("failed payment refund restores bonuses", () => {
  assert.match(refundFn, /bonusesReversed && !paymentRefunded && orderId/);
  assert.match(refundFn, /bridge\("restore", orderId\)/);
});

test("refund is idempotent and finalization cancels downstream settlements", () => {
  assert.match(refundFn, /booking-full-refund:\$\{bookingId\}/);
  assert.match(migration, /seller_settlements set status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox set status='reversed'/);
});