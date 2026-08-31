import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seller = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831185000_paid_booking_cancel_refund.sql", import.meta.url), "utf8");

test("paid bookings use refund flow instead of direct cancellation", () => {
  assert.match(seller, /functions\.invoke\("booking-cancel-refund"/);
  assert.match(seller, /r\.paid_at && <button[^>]*onClick=\{\(\) => cancelAndRefund\(r\)\}/s);
  assert.match(seller, /!r\.paid_at && <button[^>]*onClick=\{\(\) => setStatus\(r\.id, "cancelled"\)\}/s);
  assert.match(seller, /Anuluj i zwróć/);
});

test("seller distinguishes paid booking awaiting approval", () => {
  assert.match(seller, /r\.status === "pending_payment" && r\.paid_at \? "Opłacona — do akceptacji"/);
});

test("backend blocks direct cancellation of paid booking", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("refund reverses bonuses before payment and restores them on payment failure", () => {
  assert.match(edge, /bridge\("reverse", orderId\)/);
  assert.match(edge, /payCredit\(buyerEmail, amountGrosz, orderId, idem\)/);
  assert.match(edge, /stripe\.refunds\.create/);
  assert.match(edge, /bonusesReversed && !paymentRefunded/);
  assert.match(edge, /bridge\("restore", orderId\)/);
});
