import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const searchPage = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831190000_search_purchase_mode_filter.sql", import.meta.url), "utf8");

test("universal search offers purchase, appointment and rental modes across categories", () => {
  assert.match(searchPage, /label:"Kup"/);
  assert.match(searchPage, /label:"Usługi"/);
  assert.match(searchPage, /label:"Wynajem"/);
  // Wybrany tryb jedzie do bazy jako purchase_mode — teraz przez wspólną funkcję zapytania,
  // bo tryb „Do rezerwacji” pyta bazę dwa razy (usługi + wynajem).
  assert.match(searchPage, /purchase_mode:purchaseMode/);
});

test("rezerwacje mode asks the database for appointments and rentals together", () => {
  // Kafel „Rezerwacje” liczy usługi ORAZ wynajem (liczby_dzialow), więc adres ?tryb=rezerwacje
  // musi pokazać jedno i drugie. Wcześniej prowadził na ?tryb=appointment i lista była pusta,
  // mimo że licznik mówił „1 oferta” (zgłoszenie właściciela 2026-09-25).
  assert.match(searchPage, /REZERWACJE_MODES: PurchaseModeFilter\[\] = \["appointment", "daily"\]/);
  assert.match(searchPage, /mode==="rezerwacje"/);
  assert.match(searchPage, /pm==="rezerwacje"/);
});

test("search results can be paged past the first batch", () => {
  assert.match(searchPage, /const PORCJA = \d+/);
  assert.match(searchPage, /p_limit:limit/);
  assert.match(searchPage, /Pokaż więcej ofert/);
});

test("database filters by private purchase_mode without exposing it", () => {
  assert.match(migration, /p_filters \? 'purchase_mode'/);
  assert.match(migration, /coalesce\(nullif\(o\.attributes->>'purchase_mode',''\),'purchase'\)/);
  assert.match(migration, /- 'purchase_mode'/);
});