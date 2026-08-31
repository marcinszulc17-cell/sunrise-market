import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831202000_semantic_offer_type_from_purchase_mode.sql", import.meta.url), "utf8");

test("generic seller modes map to semantic offer types", () => {
  assert.match(migration, /when v_mode='appointment' then 'service'/);
  assert.match(migration, /when v_mode='daily' then 'rental'/);
  assert.match(migration, /else 'product'/);
});

test("specialist offer types are preserved", () => {
  assert.match(migration, /if v_offer_type='product' then/);
  assert.doesNotMatch(migration, /v_offer_type := case[\s\S]*when v_mode='daily' then 'samochod'/);
});

test("existing generic booking offers are backfilled", () => {
  assert.match(migration, /attributes->>'purchase_mode' in \('appointment','daily'\)/);
  assert.match(migration, /coalesce\(attributes->>'offer_type','product'\)='product'/);
});
