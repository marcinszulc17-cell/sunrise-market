import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/SprzedawcaV2.tsx", import.meta.url), "utf8");

test("explicit seller mode wins over a saved draft", () => {
  assert.match(page, /const hasRequestedMode = Boolean\(requestedMode && MODES\.some/);
  assert.match(page, /if \(!hasRequestedMode && MODES\.some\(m => m\.id === d\.purchaseMode\)\) setPurchaseMode\(d\.purchaseMode\)/);
});

test("preselected mode is summarized instead of asking the same question twice", () => {
  assert.match(page, /WYBRANY TRYB/);
  assert.match(page, /Zmień tryb/);
  assert.match(page, /\{hasRequestedMode \?/);
  assert.match(page, /\["Kategoria", "Opis i zdjęcia", "Cena i korzyści", "Podgląd"\]/);
});

test("seller wizard copy is generic for sale service and rental offers", () => {
  assert.match(page, /Wystaw usługę na termin/);
  assert.match(page, /Wystaw ofertę wynajmu/);
  assert.match(page, /Wystaw ofertę sprzedaży/);
  assert.doesNotMatch(page, /Wystaw produkt lub sprzęt/);
});
