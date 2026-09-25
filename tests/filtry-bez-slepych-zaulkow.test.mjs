import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const strona = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const migracja = await readFile(new URL("../supabase/migrations/20260925140000_filtry_kategorii.sql", import.meta.url), "utf8");
const sklep = await readFile(new URL("../src/pages/Market.tsx", import.meta.url), "utf8");
const portal = await readFile(new URL("../src/pages/CategoryPortal.tsx", import.meta.url), "utf8");
const noclegi = await readFile(new URL("../src/pages/Noclegi.tsx", import.meta.url), "utf8");

// Zgłoszenie właściciela 2026-09-25: „czy te filtry odnośnie najmu itd powinny tu być?"
// oraz „żeby nie było, że pojawiają się niepotrzebne pola". W Fotowoltaice wszystkie 36 ofert
// to zakup powyżej 6 990 zł, więc trzy tryby i trzy widełki prowadziły do pustej listy.
test("tryb bez ofert w tej gałęzi nie jest pokazywany", () => {
  assert.match(strona, /MODE_FILTERS\.filter\(m=>m\.id===""\|\|m\.id===mode\|\|\(ileWTrybie\(m\.id\)\?\?0\)>0\)/);
  assert.match(strona, /const pokazTryby=trybyDoPokazania\.length>2/);
});

test("widełki cenowe pokazują się tylko tam, gdzie zahaczają o realne ceny", () => {
  assert.match(strona, /widelkiDoPokazania/);
  assert.match(strona, /od<=\(zakres\.cenaMax as number\) && doK>=\(zakres\.cenaMin as number\)/);
  assert.match(strona, /const pokazWidelki=widelkiDoPokazania\.length>1/);
});

test("pole ze słownika, którego nikt nie wypełnia, nie jest filtrem", () => {
  assert.match(strona, /defsDoPokazania/);
  assert.match(strona, /\(zakres\.pola\[d\.key\]\?\?0\)>0/);
});

// Wybrana wartość musi zostać widoczna, inaczej nie dałoby się jej odkliknąć i użytkownik
// utknąłby na pustej liście bez wyjścia.
test("aktywny wybór zostaje widoczny nawet przy zerze", () => {
  assert.match(strona, /m\.id===mode\|\|/);
  assert.match(strona, /filters\[d\.key\]!==undefined&&filters\[d\.key\]!==""&&filters\[d\.key\]!==false/);
});

// Licznik przy przycisku musi liczyć to samo, co lista po kliknięciu.
test("zakres filtrów liczony jest tak samo jak wyniki wyszukiwania", () => {
  assert.match(migracja, /join market\.sellers s on s\.id = o\.seller_id/);
  assert.match(migracja, /where o\.status = 'active'/);
  assert.match(migracja, /coalesce\(nullif\(o\.attributes->>'purchase_mode',''\),'purchase'\)/);
  assert.match(api, /export async function filtryKategorii/);
});

test("„Do rezerwacji” liczy usługi i wynajem razem", () => {
  assert.match(strona, /id==="rezerwacje"\) return \(t\.appointment\?\?0\)\+\(t\.daily\?\?0\)/);
});

// Kreatory tworzą dane, więc muszą pokazywać komplet pól — inaczej sprzedawca nie miałby
// gdzie wpisać mocy pierwszej oferty w kategorii.
test("ograniczenie dotyczy filtrów, nie kreatorów ofert", () => {
  assert.match(migracja, /kreatory ofert czytają `category_attributes`/i);
});

// Ta sama zasada musi obowiązywać wszędzie, gdzie użytkownik coś zawęża — inaczej
// „niepotrzebne pola" wracają bocznymi drzwiami.
test("katalog /sklep ukrywa te same martwe pola, co wyszukiwarka", () => {
  assert.match(sklep, /filtryKategorii\(selected\.slug\)/);
  assert.match(sklep, /wszystkie\.filter\(\(d\) => \(pola\[d\.key\] \?\? 0\) > 0\)/);
});

test("portal działu bez ofert nie pokazuje formularza wyszukiwania", () => {
  assert.match(portal, /const \[pustyDzial,setPustyDzial\]/);
  assert.match(portal, /\{pustyDzial!==true&&<form onSubmit=\{run\}/);
});

test("noclegi bez ani jednego obiektu nie pokazują chipów udogodnień", () => {
  assert.match(noclegi, /const \[brakObiektow, setBrakObiektow\]/);
  assert.match(noclegi, /\{brakObiektow !== true && <div className="mt-3 flex flex-wrap gap-2">/);
  // Pasek „dokąd / termin / osoby" zostaje — to jest sens tej strony, nie filtr do niczego.
  assert.match(noclegi, /Dokąd jedziesz\?/);
});
