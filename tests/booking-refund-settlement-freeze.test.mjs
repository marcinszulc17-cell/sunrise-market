import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831195000_booking_refund_settlement_freeze.sql", import.meta.url), "utf8");
const hardening = await readFile(new URL("../supabase/migrations/20260831190500_booking_refund_start_guard.sql", import.meta.url), "utf8");

test("paid booking refund freezes seller payout while refund is preparing", () => {
  assert.match(migration, /'refund_pending'/);
  assert.match(migration, /new\.status = 'preparing'/);
  assert.match(migration, /status = 'refund_pending'/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
});

test("failed or blocked refund releases only refund-pending settlements", () => {
  assert.match(migration, /new\.status in \('blocked_bonus','payment_failed'\)/);
  assert.match(migration, /status = 'refund_pending'/);
  assert.match(migration, /available_at is not null then 'scheduled' else 'pending'/);
  assert.doesNotMatch(migration, /finalize_failed'\)/);
});

test("settlement freeze does not replace existing paid and pre-start refund guards", () => {
  assert.doesNotMatch(migration, /seller_booking_refund_prepare/);
  assert.match(hardening, /v\.starts_at <= now\(\)/);
  assert.match(hardening, /o\.status <> 'paid'/);
});
