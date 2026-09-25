import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modul = await readFile(new URL("../src/lib/czystaPolskaPlus.ts", import.meta.url), "utf8");
const sync = await readFile(new URL("../supabase/functions/mysunrise-sync/index.ts", import.meta.url), "utf8");
const produkt = await readFile(new URL("../src/pages/Product.tsx", import.meta.url), "utf8");
const sklep = await readFile(new URL("../src/pages/Market.tsx", import.meta.url), "utf8");
const szukaj = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");

// Zgłoszenie właściciela 2026-09-25: „nadal nie ma informacji o Czystej Polsce".
// Przyczyna: kod czytał offers.attributes.cpp, ale wdrożony mysunrise-sync w ogóle nie
// przenosił cpp_eligible z MySunrise — w Market ani jedna oferta nie miała tego atrybutu.
test("sync przenosi oznaczenie z MySunrise do Marketu", () => {
  assert.match(sync, /cpp_eligible,cpp_note/);
  assert.match(sync, /p\.cpp_eligible === true/);
  // Scalanie atrybutów zachowuje stare klucze, więc wycofanie produktu z programu
  // musi jawnie skasować plakietkę.
  assert.match(sync, /if \(!cpp\) delete mergedAttrs\.cpp;/);
});

test("oznaczenie widać i na karcie, i na stronie oferty", () => {
  assert.match(produkt, /czystaPolskaPlusInfo/);
  assert.match(sklep, /czystaPolskaPlusInfo/);
  assert.match(szukaj, /czystaPolskaPlusInfo/);
});

// To jest promocja Green Eco World, nie pieniądze publiczne. Słowo „dofinansowanie" ma
// w Polsce jedno znaczenie i klient, który je przeczyta, zacznie pytać o wniosek i urząd.
test("nigdzie nie nazywamy tego dotacją ani dofinansowaniem", () => {
  for (const [nazwa, zrodlo] of [["moduł", modul], ["strona oferty", produkt], ["katalog", sklep], ["wyszukiwarka", szukaj]]) {
    for (const slowo of [/dofinansowan/i, /dotacj/i, /program rządow/i, /Czyste Powietrze/i]) {
      assert.doesNotMatch(zrodlo.replace(/\/\/[^\n]*/g, ""), slowo, `${nazwa} nie może obiecywać pieniędzy publicznych`);
    }
  }
  assert.match(modul, /rabatu lub zwrotu na portfel MySunrise/);
});

// Katalog bez filtrów szedł przez stare search_offers, które NIE zwraca `attributes` —
// karta nie miała czym rozpoznać oznaczenia i plakietka nie pojawiała się nigdzie poza
// stroną oferty, mimo że kod karty był poprawny.
test("katalog pobiera oferty razem z atrybutami", () => {
  assert.match(sklep, /setOffers\(await searchOffersWithAttributes\(query, slug, opts\) as Offer\[\]\)/);
  assert.doesNotMatch(sklep, /setOffers\(await searchOffers\(query, slug, opts\)/);
});

// Wersja supabase-js zostaje NIEZAPIĘTA. Chwilowy błąd bundlera z 2026-09-25 wynikał
// z wyścigu przy publikacji postgrest-js 2.117.2 na npm, a nie z braku paczki — zapinanie
// wersji zostawiłoby tę jedną funkcję w tyle za resztą bez powodu.
test("sync nie ma zapiętej wersji supabase-js", () => {
  assert.match(sync, /jsr:@supabase\/supabase-js@2"/);
  assert.doesNotMatch(sync, /supabase-js@2\.\d+\.\d+/);
});
