import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831194500_paid_booking_refund_flow.sql", import.meta.url), "utf8");

test("paid booking refund reverses bonuses before returning money", () => {
  const reverseAt = edge.indexOf('bridge("reverse", orderId)');
  const walletRefundAt = edge.indexOf("refundSunrisePay(");
  const stripeRefundAt = edge.indexOf("stripe.refunds.create");
  assert.ok(reverseAt >= 0);
  assert.ok(walletRefundAt > reverseAt);
  assert.ok(stripeRefundAt > reverseAt);
});

test("failed payment refund restores reversed bonuses", () => {
  assert.match(edge, /bridge\("restore", orderId\)/);
  assert.match(edge, /status: "payment_failed"/);
});

test("Sunrise Pay refund uses deterministic idempotency key", () => {
  assert.match(edge, /uuidv5\(`booking-refund:\$\{bookingId\}`\)/);
  assert.doesNotMatch(edge, /crypto\.randomUUID\(\)/);
});

test("direct cancellation refuses paid bookings", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("refund finalization cancels order, settlement and commission outbox", () => {
  assert.match(migration, /update market\.orders set status='cancelled'/);
  assert.match(migration, /update market\.seller_settlements set status='cancelled'/);
  assert.match(migration, /update market\.ambassador_commission_outbox set status='reversed'/);
});
