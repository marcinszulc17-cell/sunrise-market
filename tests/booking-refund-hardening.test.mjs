import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/20260831185000_booking_refund_hardening.sql", import.meta.url), "utf8");

test("automatic booking refund is blocked after booking start", () => {
  assert.match(sql, /v\.starts_at <= now\(\)/);
  assert.match(sql, /Po rozpoczęciu terminu automatyczny zwrot jest zablokowany/);
});

test("automatic booking refund requires a paid order and unresolved held deposit", () => {
  assert.match(sql, /o\.status <> 'paid'/);
  assert.match(sql, /v\.deposit_status,'not_charged'\) <> 'held'/);
  assert.match(sql, /s\.status='settled'/);
});

test("migration safely replaces older refund prepare contracts", () => {
  assert.match(sql, /drop function if exists market\.seller_booking_refund_prepare\(uuid\)/);
  assert.match(sql, /grant execute on function market\.seller_booking_refund_prepare\(uuid\) to authenticated/);
});