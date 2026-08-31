import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seller = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");
const refundEdge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831184500_booking_full_refund.sql", import.meta.url), "utf8");

test("paid bookings use refund workflow instead of plain cancellation", () => {
  assert.match(seller, /booking-cancel-refund/);
  assert.match(seller, /Anuluj i zwróć/);
  assert.match(seller, /Opłacona — do akceptacji/);
  assert.match(seller, /pending_approval/);
  assert.match(migration, /Opłaconą rezerwację anuluj przez zwrot płatności/);
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /Po rozpoczęciu terminu automatyczny zwrot jest zablokowany/);
});

test("refund reverses bonuses before refunding the payment and restores them on payment failure", () => {
  const reverse = refundEdge.indexOf('bridge("reverse"');
  const payCredit = refundEdge.indexOf("payCredit(buyerEmail");
  const stripeRefund = refundEdge.indexOf("stripe.refunds.create");
  const restore = refundEdge.indexOf('bridge("restore"');
  assert.ok(reverse >= 0);
  assert.ok(payCredit > reverse);
  assert.ok(stripeRefund > reverse);
  assert.ok(restore > reverse);
  assert.match(refundEdge, /bonus_points_already_used/);
  assert.match(refundEdge, /booking_refund_finalize/);
});

test("refund cancels seller settlement and marks ambassador outbox reversal", () => {
  assert.match(migration, /seller_settlements set status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox set status='reversed'/);
  assert.match(migration, /booking_refunds/);
});