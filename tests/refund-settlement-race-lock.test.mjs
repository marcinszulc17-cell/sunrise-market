import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831210000_refund_settlement_race_lock.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const retry = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

test("refund prepare freezes unpaid seller settlement", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /status='processing'/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /o\.status <> 'paid'/);
});

test("refund abort restores frozen settlement according to availability", () => {
  assert.match(migration, /create or replace function market\.booking_refund_abort/);
  assert.match(migration, /case when available_at is not null then 'scheduled' else 'pending' end/);
  assert.match(edge, /service\.rpc\("booking_refund_abort"/);
  assert.match(edge, /if \(!paymentRefunded\) await abortRefund/);
});

test("settlement retry worker never selects refund_pending", () => {
  assert.match(retry, /\.in\("status", \["scheduled", "pending", "failed"\]\)/);
  assert.doesNotMatch(retry, /\.in\("status", \[[^\]]*refund_pending/);
});
