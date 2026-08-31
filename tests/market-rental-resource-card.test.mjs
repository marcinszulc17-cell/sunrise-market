import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quote = await readFile(new URL("../src/lib/marketRentalQuickQuote.ts", import.meta.url), "utf8");
const deep = await readFile(new URL("../src/lib/quickBookingDeepLink.ts", import.meta.url), "utf8");

test("rental cards count concrete resources available for the selected range", () => {
  assert.match(quote, /bookingPublicCatalogV2\(offerId\)/);
  assert.match(quote, /bookingUnavailableDaysV2\(offerId, fromDay, toDay, resource\.id\)/);
  assert.match(quote, /dostępne w tym terminie/);
});

test("rental cards allow choosing a concrete available resource", () => {
  assert.match(quote, /Konkretny egzemplarz/);
  assert.match(quote, /resourceSelect/);
  assert.match(quote, /params\.set\("resource", selectedResource\.name\)/);
});

test("rental deep link restores the selected resource before the date range", () => {
  assert.match(deep, /resource: p\.get\("resource"\)/);
  assert.match(deep, /selectRentalResourceIfReady\(range\.resource\)/);
  assert.match(deep, /endsWith\(resource\)/);
  assert.match(deep, /clearParams\("from", "to", "resource"\)/);
});
