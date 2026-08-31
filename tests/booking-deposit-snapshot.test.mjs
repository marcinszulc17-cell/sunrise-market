import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshot = await readFile(new URL("../supabase/migrations/20260831190000_booking_order_deposit_snapshot.sql", import.meta.url), "utf8");
const guard = await readFile(new URL("../supabase/migrations/20260831190500_deposit_cashback_guard.sql", import.meta.url), "utf8");

test("booking order snapshots refundable deposit", () => {
  assert.match(snapshot, /total_gross,cashback_amount,deposit_gross/);
  assert.match(snapshot, /round\(coalesce\(v_booking\.deposit_gross,0\),2\)/);
});

test("paid booking marks deposit held only when order contains deposit", () => {
  assert.match(snapshot, /v_order_deposit > 0/);
  assert.match(snapshot, /deposit_status/);
  assert.match(snapshot, /deposit_paid_at/);
});

test("database guard excludes deposit from cashback", () => {
  assert.match(guard, /new\.total_gross/);
  assert.match(guard, /new\.deposit_gross/);
  assert.match(guard, /trg_enforce_deposit_cashback_exclusion/);
});
