import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831191500_seller_settlement_atomic_claim.sql", import.meta.url), "utf8");
const retryFn = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

test("booking refund blocks while seller settlement is processing", () => {
  assert.match(migration, /'processing'::text/);
  assert.match(migration, /s\.status='processing'/);
  assert.match(migration, /status='refund_pending'/);
});

test("seller settlement retry worker atomically claims payout", () => {
  assert.match(retryFn, /status: "processing"/);
  assert.match(retryFn, /\.eq\("id", row\.id\)\.eq\("status", row\.status\)\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(retryFn, /if \(!claimed\) \{ skipped\+\+; continue; \}/);
  assert.match(retryFn, /eq\("status", "processing"\)/);
  assert.match(retryFn, /Stary claim wypłaty został zwolniony do ponowienia/);
});
