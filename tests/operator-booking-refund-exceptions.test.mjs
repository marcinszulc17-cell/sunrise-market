import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/OperatorBookingRefundExceptions.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831210000_operator_booking_refund_exceptions.sql", import.meta.url), "utf8");

test("operator refund exception queue is read-only and operator guarded", () => {
  assert.match(page, /operator_booking_refund_exceptions/);
  assert.match(page, /Ta strona nie wykonuje ręcznych zwrotów/);
  assert.match(page, /blocked_bonus/);
  assert.match(page, /payment_failed/);
  assert.match(page, /finalize_failed/);
  assert.doesNotMatch(page, /booking-cancel-refund/);
  assert.match(migration, /not market\.is_operator\(\)/);
  assert.match(migration, /r\.status in \('blocked_bonus','payment_failed','finalize_failed'\)/);
  assert.match(migration, /r\.status = 'preparing'/);
});
