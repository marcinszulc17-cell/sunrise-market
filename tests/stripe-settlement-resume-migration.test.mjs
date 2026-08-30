import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260830143321_stripe_settlement_resume.sql", import.meta.url),
  "utf8",
);

test("card settlement has resumable lifecycle state", () => {
  for (const state of ["not_started", "processing", "settled", "failed"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /card_settlement_attempts = card_settlement_attempts \+ 1/);
});

test("only one worker can claim a fresh settlement", () => {
  assert.match(migration, /claim_stripe_order_settlement/);
  assert.match(migration, /card_settlement_status in \('not_started', 'failed'\)/);
  assert.match(migration, /interval '5 minutes'/);
});

test("claim function is service-role only", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all .* public, anon, authenticated/i);
  assert.match(migration, /grant execute .* service_role/i);
});
