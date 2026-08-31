import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260831200000_booking_refund_final_payout_lock.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

test("final refund prepare runs after the 19:45 guard", () => {
  assert.ok(migrationUrl.pathname.includes("20260831200000_"));
  assert.match(migration, /FINAL PAID BOOKING REFUND PREPARE/);
});

test("final refund prepare keeps strongest guards and payout lock", () => {
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /o\.status <> 'paid'/);
  assert.match(migration, /s\.status='settled'/);
  assert.match(migration, /deposit_status,'not_charged'\) <> 'held'/);
  assert.match(migration, /status='refund_pending'/);
  assert.match(migration, /'refund_pending'::text/);
});