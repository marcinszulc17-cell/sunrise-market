import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prywatny = await readFile(new URL("../src/pages/PrivateOfferWizard.tsx", import.meta.url), "utf8");
const firmowy = await readFile(new URL("../src/pages/SprzedawcaV2.tsx", import.meta.url), "utf8");
const dedykowany = await readFile(new URL("../src/pages/DedicatedOfferWizard.tsx", import.meta.url), "utf8");

// Oferta zostawiona na dziale albo na kategorii z dziećmi nie pokazuje się tam, gdzie klient
// jej szuka — schodzi do podkategorii i widzi pustkę.
test("wizards require the category to be taken down to a leaf", () => {
  assert.match(prywatny, /function niedokonczonaKategoria\(\)/);
  assert.match(prywatny, /d2\.length > 0 && !s2/);
  assert.match(prywatny, /d3\.length > 0 && !s3/);
  assert.match(firmowy, /d2\.length > 0 && !s2/);
  assert.match(firmowy, /d3\.length > 0 && !s3/);
});

test("every wizard requires at least one photo", () => {
  for (const zrodlo of [prywatny, firmowy, dedykowany]) {
    assert.match(zrodlo, /!images\.length.*Dodaj przynajmniej jedno zdjęcie/s);
  }
});

// Oferta powstaje PRZED konfiguracją kalendarza. Gdy wywróci się drugi krok, komunikat
// „nie udało się opublikować” kazałby sprzedawcy kliknąć ponownie i zrobić duplikat.
test("a failed booking setup never reads as a failed publish", () => {
  for (const zrodlo of [prywatny, firmowy, dedykowany]) {
    assert.match(zrodlo, /try \{[\s\S]{0,600}?configureBookingOffer[\s\S]{0,600}?\} catch \{/);
  }
});
