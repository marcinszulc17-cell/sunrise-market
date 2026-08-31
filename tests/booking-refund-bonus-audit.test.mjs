import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831221000_booking_refund_bonus_audit.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");

test("refund edge records bonus reversal before external payment refund", () => {
  const reversal = edge.indexOf('bridge("reverse", orderId)');
  const state = edge.indexOf('status: "bonuses_reversed"');
  const walletRefund = edge.indexOf('row.payment_provider === "sunrise_pay"');
  assert.ok(reversal >= 0 && state > reversal && walletRefund > state);
});

test("database refuses refunded status without recorded bonus reversal", () => {
  assert.match(migration, /bonuses_reversed/);
  assert.match(migration, /new\.status = 'refunded'/);
  assert.match(migration, /old\.status not in \('bonuses_reversed','refunded'\)/);
  assert.match(migration, /booking_refund_bonus_reversal_guard/);
});
