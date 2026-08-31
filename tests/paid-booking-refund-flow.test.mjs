import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831180000_paid_booking_refund_flow.sql", import.meta.url), "utf8");
const startGuard = await readFile(new URL("../supabase/migrations/20260831194500_booking_refund_before_start_guard.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const sellerPage = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("paid booking cannot use plain cancellation", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("automatic paid booking refund is blocked after booking start", () => {
  assert.match(startGuard, /if v\.starts_at <= now\(\) then raise exception 'Automatyczny zwrot jest dostępny tylko przed rozpoczęciem terminu\.'/);
});

test("paid booking refund reverses bonuses and restores them if payment refund fails", () => {
  assert.match(edge, /bridge\("reverse", orderId\)/);
  assert.match(edge, /bridge\("restore", orderId\)/);
  assert.match(edge, /points_already_used/);
});

test("refund supports Sunrise Pay and Stripe before database finalization", () => {
  assert.match(edge, /row\.payment_provider === "sunrise_pay"/);
  assert.match(edge, /row\.payment_provider === "stripe"/);
  assert.match(edge, /stripe\.refunds\.create/);
  assert.match(edge, /payCredit\(/);
  assert.match(edge, /booking_refund_finalize/);
});

test("seller UI separates unpaid cancellation from paid cancel and refund", () => {
  assert.match(sellerPage, /Anuluj i zwróć/);
  assert.match(sellerPage, /Opłacona — do akceptacji/);
  assert.match(sellerPage, /booking-cancel-refund/);
  assert.match(sellerPage, /&& r\.paid_at && <button/);
  assert.match(sellerPage, /&& !r\.paid_at && <button/);
});
