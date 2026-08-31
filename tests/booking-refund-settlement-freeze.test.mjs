import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831193000_booking_refund_settlement_freeze.sql", import.meta.url), "utf8");

test("refund settlement is frozen without replacing refund authorization guards", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /new\.status = 'preparing'/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
  assert.match(migration, /new\.status in \('blocked_bonus','payment_failed'\)/);
  assert.match(migration, /status = case when available_at is not null then 'scheduled' else 'pending' end/);
  assert.doesNotMatch(migration, /create or replace function market\.seller_booking_refund_prepare/);
});
