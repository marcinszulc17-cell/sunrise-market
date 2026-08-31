import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/migrations/20260831191000_booking_refund_final_safety.sql", import.meta.url), "utf8");

test("refund prepare freezes seller payout and enforces financial guards", () => {
  assert.match(sql, /status='refund_pending'/);
  assert.match(sql, /v\.starts_at<=now\(\)/);
  assert.match(sql, /o\.status<>'paid'/);
  assert.match(sql, /v\.deposit_status,'not_charged'\)<>'held'/);
});

test("failed external refund releases seller payout lock", () => {
  assert.match(edge, /async function restoreSellerSettlement/);
  assert.match(edge, /eq\("status", "refund_pending"\)/);
  assert.match(edge, /await restoreSellerSettlement\(service, orderId\)/);
  assert.match(edge, /if \(!paymentRefunded\) \{/);
});

test("successful payment refund keeps payout locked until database finalization", () => {
  assert.match(edge, /refund_paid_finalize_pending/);
  assert.doesNotMatch(edge, /refund_paid_finalize_pending[\s\S]{0,300}restoreSellerSettlement/);
});