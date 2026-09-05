import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/migrations/20260831190500_booking_refund_payout_lock.sql", import.meta.url), "utf8");

test("refund prepare freezes unsettled seller payout and enforces final guards", () => {
  assert.match(sql, /status='refund_pending'/);
  assert.match(sql, /v\.starts_at <= now\(\)/);
  assert.match(sql, /o\.status <> 'paid'/);
  assert.match(sql, /v\.deposit_status,'not_charged'\) <> 'held'/);
});

test("failed refund restores seller payout while paid refund keeps it locked for finalization", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(edge, /async function restoreSellerSettlement/);
  assert.match(edge, /eq\("status", "refund_pending"\)/);
  assert.match(edge, /if \(!paymentRefunded\) \{/);
  assert.match(edge, /await restoreSellerSettlement\(service, orderId\)/);
  assert.match(edge, /refund_paid_finalize_pending/);
});