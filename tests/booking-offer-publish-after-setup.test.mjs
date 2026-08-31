import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831193000_booking_offer_publish_after_setup.sql", import.meta.url), "utf8");
const wizard = await readFile(new URL("../src/pages/SprzedawcaV2.tsx", import.meta.url), "utf8");
const setup = await readFile(new URL("../src/pages/SellerBookingSetup.tsx", import.meta.url), "utf8");

test("booking offers stay hidden until booking setup is activated", () => {
  assert.match(migration, /v_status := case when v_purchase_mode in \('appointment','daily'\) then 'paused' else 'active' end;/);
  assert.match(migration, /if p_active then[\s\S]*status = 'active'[\s\S]*status = 'paused'[\s\S]*purchase_mode'[\s\S]*appointment','daily'/);
  assert.match(wizard, /purchaseMode !== "purchase"[\s\S]*active: false/);
  assert.match(setup, /Aktywuj booking/);
  assert.match(setup, /configureBookingOffer\([\s\S]*active:next/);
});

test("regular purchase offers remain immediately active", () => {
  assert.match(migration, /else 'active' end/);
});
