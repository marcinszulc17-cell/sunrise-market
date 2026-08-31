import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831180000_paid_booking_refund_flow.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-refund/index.ts", import.meta.url), "utf8");

test("plain seller cancellation cannot cancel a paid booking", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("paid booking refund reverses bonuses before refunding money", () => {
  const reverse = edge.indexOf('bridge("reverse"');
  const walletRefund = edge.indexOf("payCredit(");
  const stripeRefund = edge.indexOf("stripe.refunds.create");
  assert.ok(reverse >= 0);
  assert.ok(walletRefund >= 0);
  assert.ok(stripeRefund > reverse);
});

test("failed payment refund restores bonuses and leaves booking unfinalized", () => {
  assert.match(edge, /bridge\("restore"/);
  assert.match(edge, /status: "payment_failed"/);
});

test("successful refund finalizes booking and reverses ambassador outbox", () => {
  assert.match(migration, /status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox set status='reversed'/);
  assert.match(migration, /status in \('ready','pending_vat','pending_identity','sent','failed','reversed'\)/);
  assert.match(migration, /seller_settlements_status_check/);
  assert.match(migration, /'cancelled'/);
});

test("refund is blocked after seller settlement or separate deposit resolution", () => {
  assert.match(migration, /s\.status='settled'/);
  assert.match(migration, /deposit_status,'not_charged'\) not in \('held','not_charged'\)/);
});