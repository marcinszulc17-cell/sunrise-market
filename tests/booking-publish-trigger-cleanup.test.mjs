import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260901000500_remove_legacy_booking_publish_triggers.sql", import.meta.url), "utf8");

test("legacy booking publish triggers are removed after booking_setup_pending lifecycle wins", () => {
  assert.match(migration, /drop trigger if exists booking_offer_publish_on_activation_trg/);
  assert.match(migration, /drop trigger if exists booking_offer_hide_until_setup_trg/);
  assert.match(migration, /drop function if exists market\.publish_booking_offer_on_activation\(\)/);
  assert.match(migration, /booking_setup_offer_visibility_trg/);
  assert.match(migration, /sync_booking_setup_offer_visibility/);
});
