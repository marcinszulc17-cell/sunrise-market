import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260831194500_booking_refund_final_order_guard.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

test("final refund guard is ordered after the 19:30 parallel refund migration", () => {
  assert.ok(migrationUrl.pathname.includes("20260831194500_"));
  assert.match(migration, /FINAL ORDER GUARD/);
});

test("final automatic refund guard keeps the strongest financial checks", () => {
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /o\.status <> 'paid'/);
  assert.match(migration, /s\.status='settled'/);
  assert.match(migration, /deposit_status,'not_charged'\) <> 'held'/);
});

test("final guard safely replaces whatever refund prepare contract ran earlier", () => {
  assert.match(migration, /drop function if exists market\.seller_booking_refund_prepare\(uuid\)/);
  assert.match(migration, /grant execute on function market\.seller_booking_refund_prepare\(uuid\) to authenticated/);
});