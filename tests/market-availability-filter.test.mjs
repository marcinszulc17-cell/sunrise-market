import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const filter = await readFile(new URL("../src/lib/marketAvailabilityFilter.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("market availability filter exposes today tomorrow and weekend quick filters", () => {
  assert.match(filter, /Dostępne dzisiaj/);
  assert.match(filter, /Dostępne jutro/);
  assert.match(filter, /Ten weekend/);
});

test("availability quick filters use real booking slots and exclude purchase-only offers", () => {
  assert.match(filter, /bookingAvailableSlots\(offerId, from, to\)/);
  assert.match(filter, /purchaseMode\(offer\) === "purchase"/);
  assert.match(filter, /slots\.length > 0/);
});

test("market startup wires the availability filter", () => {
  assert.match(main, /startMarketAvailabilityFilter/);
  assert.match(main, /startMarketAvailabilityFilter\(\)/);
});
