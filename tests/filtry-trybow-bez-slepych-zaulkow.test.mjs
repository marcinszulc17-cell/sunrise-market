import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const strona = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const migracja = await readFile(new URL("../supabase/migrations/20260925140000_tryby_ofert_w_kategorii.sql", import.meta.url), "utf8");

// Pytanie właściciela 2026-09-25: „czy te filtry odnośnie najmu itd powinny tu być?"
// W Fotowoltaice wszystkie 36 ofert to zakup, więc „Usługi", „Wynajem" i „Do rezerwacji"
// były trzema przyciskami prowadzącymi do pustej listy.
test("tryb bez ofert w tej gałęzi nie jest pokazywany", () => {
  assert.match(strona, /trybyDoPokazania/);
  assert.match(strona, /MODE_FILTERS\.filter\(m=>m\.id===""\|\|m\.id===mode\|\|\(ileWTrybie\(m\.id\)\?\?0\)>0\)/);
});

test("wybrany tryb zostaje widoczny nawet przy zerze, żeby dało się go odkliknąć", () => {
  assert.match(strona, /m\.id===mode\|\|/);
});

test("filtr z jedną drogą zakupu w ogóle się nie pokazuje", () => {
  assert.match(strona, /const pokazTryby=trybyDoPokazania\.length>2/);
  assert.match(strona, /\{pokazTryby&&<div><div className="mb-2 text-sm font-semibold">Jak chcesz skorzystać\?/);
});

// Licznik przy przycisku musi liczyć to samo, co lista po kliknięciu — ten sam status
// i te same złączenia, co w search_offers_v2.
test("liczby trybów liczone są tak samo jak wyniki wyszukiwania", () => {
  assert.match(migracja, /join market\.sellers s on s\.id = o\.seller_id/);
  assert.match(migracja, /where o\.status = 'active'/);
  assert.match(migracja, /coalesce\(nullif\(o\.attributes->>'purchase_mode',''\),'purchase'\)/);
  assert.match(api, /export async function trybyOfert/);
});

test("„Do rezerwacji” liczy usługi i wynajem razem", () => {
  assert.match(strona, /id==="rezerwacje"\) return \(trybCounts\.appointment\?\?0\)\+\(trybCounts\.daily\?\?0\)/);
});
