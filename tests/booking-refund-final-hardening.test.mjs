import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/20260831201000_booking_refund_final_hardening.sql", import.meta.url), "utf8");

test("final booking refund migration keeps production guards after older refund migrations", () => {
  assert.match(sql, /v\.starts_at <= now\(\)/);
  assert.match(sql, /o\.status <> 'paid'/);
  assert.match(sql, /deposit_status,'not_charged'\) <> 'held'/);
  assert.match(sql, /status in \('ready','sent','failed','pending_vat','pending_identity'\)/);
  assert.match(sql, /grant execute on function market\.booking_refund_finalize\(uuid,text\) to service_role/);
});