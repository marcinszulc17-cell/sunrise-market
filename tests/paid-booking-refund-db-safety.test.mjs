import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831193000_paid_booking_refund_flow.sql", import.meta.url), "utf8");

test("paid bookings cannot be cancelled without the refund flow", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
  assert.match(migration, /seller_booking_refund_prepare/);
  assert.match(migration, /booking_refund_finalize/);
});

test("refund finalization cancels unsettled payouts and every commission outbox state including ready", () => {
  assert.match(migration, /seller_settlements[\s\S]*status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox[\s\S]*status='reversed'/);
  assert.match(migration, /status in \('ready','sent','failed','pending_vat','pending_identity'\)/);
});

test("full refund marks a separately held deposit as refunded instead of paying it twice", () => {
  assert.match(migration, /deposit_status=case when coalesce\(deposit_gross,0\)>0 then 'refunded'/);
  assert.match(migration, /deposit_retained_gross=case when coalesce\(deposit_gross,0\)>0 then 0/);
});
