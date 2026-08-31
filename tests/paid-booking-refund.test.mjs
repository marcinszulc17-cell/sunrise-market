import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const refund = await readFile(new URL("../supabase/functions/booking-refund-action/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831184500_paid_booking_refunds.sql", import.meta.url), "utf8");
const seller = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("paid booking refund reverses bonuses before returning money and restores them on payment failure", () => {
  assert.match(refund, /marketBridge\("reverse", orderId\)/);
  assert.match(refund, /marketBridge\("restore", orderId\)/);
  assert.match(refund, /payment_provider === "sunrise_pay"/);
  assert.match(refund, /payment_provider === "stripe"/);
  assert.match(refund, /stripe\.refunds\.create/);
  assert.match(refund, /uuidv5\(`market:booking-refund:/);
  assert.match(refund, /booking_refund_finalize/);
});

test("normal seller cancellation is blocked after payment", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
  assert.match(migration, /seller_booking_refund_prepare/);
  assert.match(migration, /seller_settlements.*cancelled/s);
  assert.match(migration, /ambassador_commission_outbox.*reversed/s);
});

test("seller UI exposes full refund for paid bookings and distinguishes paid approval", () => {
  assert.match(seller, /booking-refund-action/);
  assert.match(seller, /Anuluj i zwróć/);
  assert.match(seller, /Opłacona — do akceptacji/);
});
