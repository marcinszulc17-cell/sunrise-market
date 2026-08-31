import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const link = await readFile(new URL("../src/lib/bookingLink.ts", import.meta.url), "utf8");
const market = await readFile(new URL("../src/pages/MarketEnhanced.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/components/BuyerOfferActions.tsx", import.meta.url), "utf8");

test("booking helper adds booking=1 only for booking deep links", () => {
  assert.match(link, /booking \? `\$\{base\}\?booking=1` : base/);
  assert.match(link, /params\.get\("booking"\) === "1"/);
});

test("market booking CTA deep-links to the booking flow", () => {
  assert.match(market, /offerDetailHref\(offerId, true\)/);
  assert.match(market, /if \(cta\.booking\)/);
  assert.match(market, /split\("\/produkt\/"\)\[1\]\?\.split\("\?"\)\[0\]/);
});

test("buyer actions auto-open configured booking once deep-linked", () => {
  assert.match(actions, /shouldAutoOpenBooking\(window\.location\.search\)/);
  assert.match(actions, /autoOpenHandled\.current=true/);
  assert.match(actions, /if\(bookingConfig\) setBookingOpen\(true\)/);
});
