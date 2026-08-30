import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260830141938_stripe_fixed_seller_fee_129.sql", import.meta.url),
  "utf8",
);

test("Stripe seller fee is fixed at 12.9% and payout at 87.1%", () => {
  assert.match(migration, /commission_rate = 0\.129/);
  assert.match(migration, /\* 0\.129/);
  assert.match(migration, /\* 0\.871/);
});

test("Stripe fee function is service-role only", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all .* public, anon, authenticated/i);
  assert.match(migration, /grant execute .* service_role/i);
});
