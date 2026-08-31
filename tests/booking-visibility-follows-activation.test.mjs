import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831200000_booking_visibility_follows_activation.sql", import.meta.url), "utf8");

test("booking offer visibility follows booking active state", () => {
  assert.match(migration, /case when new\.active then 'active' else 'paused' end/);
  assert.match(migration, /o\.status in \('active', 'paused'\)/);
  assert.match(migration, /purchase_mode'[\s\S]*appointment', 'daily'/);
  assert.match(migration, /after insert or update of active on market\.booking_offers/);
});

test("visibility sync does not touch regular purchase or blocked archived offers", () => {
  assert.doesNotMatch(migration, /purchase_mode'[\s\S]*purchase'/);
  assert.doesNotMatch(migration, /o\.status in \([^)]*blocked/);
  assert.doesNotMatch(migration, /o\.status in \([^)]*archived/);
});
