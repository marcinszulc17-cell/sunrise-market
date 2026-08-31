import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190500_booking_refund_start_guard.sql", import.meta.url), "utf8");

test("automatic paid booking refund is blocked after booking start", () => {
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /Po rozpoczęciu terminu automatyczny zwrot jest zablokowany/);
  assert.match(migration, /o\.status <> 'paid'/);
  assert.match(migration, /deposit_status,'not_charged'\) <> 'held'/);
});