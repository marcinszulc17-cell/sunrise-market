import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831184500_paid_booking_refund.sql", import.meta.url), "utf8");

test("paid booking refund reverses bonuses before returning money", () => {
  const reverseAt = edge.indexOf('action: "reverse"');
  const walletRefundAt = edge.indexOf('"pay-credit"');
  const stripeRefundAt = edge.indexOf("stripe.refunds.create");
  assert.ok(reverseAt >= 0);
  assert.ok(walletRefundAt > reverseAt);
  assert.ok(stripeRefundAt > reverseAt);
});

test("failed payment refund restores reversed bonuses", () => {
  assert.match(edge, /action: "restore"/);
  assert.match(edge, /payment_failed/);
});

test("refund is finalized only after payment provider succeeds", () => {
  const paymentAt = Math.min(edge.indexOf('"pay-credit"'), edge.indexOf("stripe.refunds.create"));
  const finalizeAt = edge.indexOf('service.rpc("booking_refund_finalize"');
  assert.ok(paymentAt >= 0 && finalizeAt > paymentAt);
});

test("direct seller cancellation blocks already paid bookings", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("refund cancels scheduled seller settlement and marks commission reversal", () => {
  assert.match(migration, /seller_settlements[\s\S]*status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox[\s\S]*status='reversed'/);
});
