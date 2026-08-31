import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seller = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831182000_booking_full_refund.sql", import.meta.url), "utf8");

test("seller uses refund flow for paid active bookings", () => {
  assert.match(seller, /Opłacona — do akceptacji/);
  assert.match(seller, /booking-cancel-refund/);
  assert.match(seller, /Anuluj i zwróć/);
  assert.match(seller, /&& !r\.paid_at && <button/);
  assert.match(seller, /&& !!r\.paid_at && <button/);
});

test("paid booking cannot be plainly cancelled in database", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
  assert.match(migration, /seller_booking_refund_prepare/);
  assert.match(migration, /booking_refund_finalize/);
  assert.match(migration, /status='reversed'/);
  assert.match(migration, /status='cancelled'/);
});

test("refund reverses bonuses before refund and restores them if payment refund fails", () => {
  const reverseAt = edge.indexOf('bridge("reverse"');
  const payAt = edge.indexOf('row.payment_provider === "sunrise_pay"');
  const restoreAt = edge.indexOf('bridge("restore"');
  assert.ok(reverseAt >= 0 && payAt > reverseAt, "bonus reversal must happen before monetary refund");
  assert.ok(restoreAt > payAt, "bonus restore must exist on failed monetary refund path");
  assert.match(edge, /points_already_used/);
  assert.match(edge, /stripe\.refunds\.create/);
  assert.match(edge, /pay-credit/);
});
