import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831201000_booking_offer_publish_lifecycle.sql", import.meta.url), "utf8");
const wizard = await readFile(new URL("../src/pages/SprzedawcaV2.tsx", import.meta.url), "utf8");
const setup = await readFile(new URL("../src/pages/SellerBookingSetup.tsx", import.meta.url), "utf8");

test("new booking offers stay paused until calendar activation", () => {
  assert.match(migration, /before insert on market\.offers/);
  assert.match(migration, /purchase_mode'[\s\S]*appointment','daily'/);
  assert.match(migration, /new\.status := 'paused'/);
  assert.match(wizard, /purchaseMode !== "purchase"[\s\S]*active: false/);
});

test("activating booking publishes a paused booking offer", () => {
  assert.match(migration, /after insert or update of active on market\.booking_offers/);
  assert.match(migration, /new\.active = true/);
  assert.match(migration, /set status = 'active'/);
  assert.match(migration, /status = 'paused'/);
  assert.match(setup, /Aktywuj booking/);
});

test("disabling booking later does not hide an already published offer", () => {
  assert.doesNotMatch(migration, /new\.active = false[\s\S]*status = 'paused'/);
});
