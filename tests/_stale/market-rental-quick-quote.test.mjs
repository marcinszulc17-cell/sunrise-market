import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quote = await readFile(new URL("../src/lib/marketRentalQuickQuote.ts", import.meta.url), "utf8");
const deep = await readFile(new URL("../src/lib/quickBookingDeepLink.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("daily booking cards expose a from-to quick quote", () => {
  assert.match(quote, /Szybka wycena wynajmu/);
  assert.match(quote, /bookingDailyQuoteV2\(offerId, fromDay, toDay\)/);
  assert.match(quote, /aria-label", "Wynajem od"/);
  assert.match(quote, /aria-label", "Wynajem do"/);
  assert.match(quote, /Zarezerwuj ·/);
});

test("rental quote passes the selected range into booking deep link", () => {
  assert.match(quote, /params\.set\("from", fromDay\)/);
  assert.match(quote, /params\.set\("to", toDay\)/);
  assert.match(deep, /function rentalRange\(\)/);
  assert.match(deep, /clickRentalRangeIfReady/);
  assert.match(deep, /clearParams\("from", "to"\)/);
});

test("rental quick quote is started by the market app", () => {
  assert.match(main, /startMarketRentalQuickQuote/);
  assert.match(main, /startMarketRentalQuickQuote\(\)/);
});
