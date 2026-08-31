import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../src/lib/sellerResourceOperationalStatus.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831_resource_operational_status.sql", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("seller resource operational statuses expose available service failure and blocked", () => {
  assert.match(ui, /Dostępny/);
  assert.match(ui, /Serwis/);
  assert.match(ui, /Awaria/);
  assert.match(ui, /Blokada/);
});

test("operational status reuses booking resource time off instead of parallel availability", () => {
  assert.match(migration, /booking_resource_time_off/);
  assert.match(migration, /\[STATUS\] Serwis/);
  assert.match(migration, /\[STATUS\] Awaria/);
  assert.match(migration, /\[STATUS\] Blokada/);
});

test("available removes only operational status blocks", () => {
  assert.match(migration, /reason,''\) like '\[STATUS\] %'/);
  assert.match(migration, /v_status <> 'available'/);
});

test("market startup wires seller resource operational status controls", () => {
  assert.match(main, /startSellerResourceOperationalStatus/);
  assert.match(main, /startSellerResourceOperationalStatus\(\)/);
});
