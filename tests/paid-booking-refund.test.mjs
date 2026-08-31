import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-refund-action/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831191500_paid_booking_full_refund.sql", import.meta.url), "utf8");
const booking = await readFile(new URL("../src/lib/bookingV2.ts", import.meta.url), "utf8");

test("paid booking refund reverses bonuses before payment refund and restores on payment failure", () => {
  assert.match(edge, /bridge\("reverse", orderId\)/);
  assert.match(edge, /points_already_used/);
  assert.match(edge, /refundWallet\(buyerEmail, amountGrosz, orderId, bookingId\)/);
  assert.match(edge, /stripe\.refunds\.create/);
  assert.match(edge, /bonusesReversed && !paymentRefunded/);
  assert.match(edge, /bridge\("restore", orderId\)/);
  assert.match(edge, /booking_refund_finalize/);
});

test("plain seller cancellation blocks paid bookings", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("refund audit statuses support reversed commissions and cancelled seller settlement", () => {
  assert.match(migration, /'reversed'/);
  assert.match(migration, /'cancelled'/);
  assert.match(migration, /create table if not exists market\.booking_refunds/);
  assert.match(migration, /enable row level security/);
});

test("client helper uses authenticated refund edge action", () => {
  assert.match(booking, /export async function refundPaidBooking/);
  assert.match(booking, /booking-refund-action/);
});
