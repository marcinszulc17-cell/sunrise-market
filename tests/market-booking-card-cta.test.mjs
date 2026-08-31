import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const market = await readFile(new URL("../src/pages/MarketEnhanced.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("production market route uses the enhanced booking-aware market", () => {
  assert.match(main, /<Route path="\/" element=\{<MarketEnhanced \/>\} \/>/);
});

test("booking cards expose distinct appointment and rental CTAs", () => {
  for (const label of [
    "Wybierz termin",
    "Umów usługę",
    "Wybierz daty",
    "Zarezerwuj pobyt",
    "Zarezerwuj pojazd",
  ]) assert.match(market, new RegExp(label));

  assert.match(market, /badge: "Termin online"/);
  assert.match(market, /badge: "Rezerwacja online"/);
});

test("booking cards never use the normal cart action", () => {
  assert.match(market, /resolveCartForMode\(article, special \|\| mode !== "purchase"\)/);
  assert.match(market, /guardCartUntilModeResolved\(article\)/);
  assert.match(market, /offerDetailHref\(offerId, true\)/);
});

test("existing cashback remains visible and booking cashback is based on paid reservation value", () => {
  assert.match(market, /Cashback \$\{percent\}% · \+\$\{amount/);
  assert.match(market, /Cashback \$\{percent\}% od wartości rezerwacji/);
  assert.match(market, /bez zwrotnej kaucji/);
});
