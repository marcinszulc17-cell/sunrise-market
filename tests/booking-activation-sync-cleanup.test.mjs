import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260901001000_remove_regressive_booking_activation_sync.sql", import.meta.url), "utf8");

test("reactivating booking cannot republish a manually hidden offer", () => {
  assert.match(migration, /drop trigger if exists trg_booking_offer_visibility/);
  assert.match(migration, /drop function if exists market\.sync_booking_offer_visibility\(\)/);
  assert.match(migration, /booking_setup_offer_visibility_trg/);
  assert.match(migration, /sync_booking_setup_offer_visibility/);
});
