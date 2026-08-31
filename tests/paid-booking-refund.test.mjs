import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_paid_booking_refund_safe.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");

test("paid booking refund is blocked after booking start and settled seller payout", () => {
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /seller_settlements[\s\S]*status='settled'/);
  assert.match(migration, /o\.status <> 'paid'/);
});

test("paid booking refund requires recorded bonus reversal before finalization", () => {
  assert.match(migration, /bonuses_reversed/);
  assert.match(migration, /r\.status<>'bonuses_reversed'/);
  assert.match(edge, /bridge\("reverse", orderId\)/);
  assert.match(edge, /status: "bonuses_reversed"/);
});

test("payment refund is idempotent and restores bonuses when payment refund fails", () => {
  assert.match(edge, /uuidv5\(`booking-full-refund:\$\{bookingId\}`\)/);
  assert.match(edge, /idempotencyKey: `booking-full-refund:\$\{bookingId\}`/);
  assert.match(edge, /bonusesReversed && !paymentRefunded/);
  assert.match(edge, /bridge\("restore", orderId\)/);
});

test("full refund finalizes booking, order, seller settlement, outbox and deposit", () => {
  assert.match(migration, /market\.orders set status='cancelled'/);
  assert.match(migration, /deposit_status=case when coalesce\(deposit_gross,0\)>0 then 'refunded'/);
  assert.match(migration, /seller_settlements set status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox set status='reversed'/);
});
