import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/MarketEnhanced.tsx", import.meta.url), "utf8");

test("market cards guard cart until purchase mode is resolved", () => {
  assert.match(source, /function guardCartUntilModeResolved\(article: HTMLElement\)/);
  assert.match(source, /button\.style\.visibility = "hidden"/);
  assert.match(source, /guardCartUntilModeResolved\(article\);/);
});

test("booking and specialist offers never expose add-to-cart after decoration", () => {
  assert.match(source, /resolveCartForMode\(article, special \|\| mode !== "purchase"\);/);
  assert.match(source, /button\.style\.display = hide \? "none" : ""/);
});

test("booking CTA keeps deep link that auto-opens booking", () => {
  assert.match(source, /offerDetailHref\(offerId, true\)/);
});