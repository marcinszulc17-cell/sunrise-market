import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sekcje = await readFile(new URL("../src/components/home/HomeShared.tsx", import.meta.url), "utf8");
const portal = await readFile(new URL("../src/pages/CategoryPortal.tsx", import.meta.url), "utf8");
const migracja = await readFile(new URL("../supabase/migrations/20260925120000_liczby_dzialow_zgodne_z_listami.sql", import.meta.url), "utf8");
const start = await readFile(new URL("../src/pages/Start.tsx", import.meta.url), "utf8");

// Zgłoszenie właściciela 2026-09-25: „pokazuje, że w noclegach jest oferta, a jej nie ma".
// Każdy licznik na kaflu musi liczyć DOKŁADNIE to, co widać po kliknięciu.
test("kafel Rezerwacje prowadzi tam, gdzie liczy: usługi + wynajem", () => {
  assert.match(migracja, /'rezerwacje', count\(\*\) from aktywne where tryb in \('appointment','daily'\)/);
  assert.match(sekcje, /key: "rezerwacje", to: "\/szukaj\?tryb=rezerwacje"/);
});

test("kafel Zakupy liczy cały katalog, bo /sklep pokazuje cały katalog", () => {
  assert.match(migracja, /select 'zakupy'::text, count\(\*\) from aktywne\s*\n/);
  assert.doesNotMatch(migracja, /'zakupy'::text, count\(\*\) from aktywne\s*\n\s*where root_slug not in/);
  assert.match(sekcje, /key: "zakupy", to: "\/sklep"/);
});

// Portal działu pokazywał tylko jedną podkategorię, a kafel liczył cały korzeń —
// „4 oferty" na kaflu i dwie na liście (części i wynajem były niewidoczne).
test("portal działu przeszukuje cały dział, nie jedną podkategorię", () => {
  assert.match(portal, /const searchSlug = rootSlug;/);
  assert.doesNotMatch(portal, /searchSlug = car \? "motoryzacja-samochody-osobowe"/);
});

test("pusty dział na telefonie prowadzi do wystawienia oferty, nie do pustej listy", () => {
  assert.match(start, /const pusty = ile === 0/);
  assert.match(start, /pusty \? "\/sprzedawca\/wystaw" : t\.to/);
});
