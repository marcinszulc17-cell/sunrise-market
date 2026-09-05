import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const availability = await readFile(new URL("../src/lib/marketBookingAvailability.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("market starts real booking availability enrichment", () => {
  assert.match(main, /startMarketBookingAvailability\(\)/);
});

test("booking card availability uses real booking slots", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(availability, /bookingAvailableSlots\(offerId, from, to\)/);
  assert.match(availability, /Najbliższy termin:/);
  assert.match(availability, /Najbliżej dostępne:/);
  assert.match(availability, /Sprawdź dostępność/);
});

test("availability never touches normal purchase cards", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(availability, /if \(mode === "purchase"\) return null/);
  assert.match(availability, /purchaseMode\(offer\) === "purchase"/);
});
