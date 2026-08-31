import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260901000000_booking_setup_offer_visibility.sql", import.meta.url),
  "utf8",
);

test("new inactive booking setup pauses the offer until first activation", () => {
  assert.match(migration, /tg_op = 'INSERT' and new\.active = false/);
  assert.match(migration, /status = 'paused'/);
  assert.match(migration, /booking_setup_pending/);
});

test("first booking activation republishes only auto-paused setup offers", () => {
  assert.match(migration, /old\.active = false/);
  assert.match(migration, /new\.active = true/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /status = 'paused'/);
  assert.match(migration, /attributes ->> 'booking_setup_pending'/);
  assert.match(migration, /- 'booking_setup_pending'/);
});

test("later booking disable does not automatically hide a published offer", () => {
  assert.doesNotMatch(migration, /tg_op = 'UPDATE'[^]*new\.active = false[^]*status = 'paused'/);
});
