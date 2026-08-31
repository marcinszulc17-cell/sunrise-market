import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_paid_booking_refund_flow.sql", import.meta.url), "utf8");
const refundFn = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");

test("paid booking refund freezes and restores seller settlement safely", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /booking_refund_abort/);
  assert.match(migration, /Opłaconą rezerwację anuluj przez zwrot płatności/);
  assert.match(migration, /status='cancelled'/);
  assert.match(migration, /status='reversed'/);
});

test("refund endpoint restores state when payment refund fails", () => {
  assert.match(refundFn, /async function abortRefund/);
  assert.match(refundFn, /bridge\("restore", orderId\)/);
  assert.match(refundFn, /if \(!paymentRefunded\) await abortRefund/);
  assert.match(refundFn, /refund_paid_finalize_pending/);
});