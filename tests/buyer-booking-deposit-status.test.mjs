import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/Rezerwacje.tsx", import.meta.url), "utf8");

test("buyer booking page explains booking deposit lifecycle", () => {
  assert.match(page, /Pobrana i zabezpieczona/);
  assert.match(page, /Zwrócona/);
  assert.match(page, /Zatrzymana/);
  assert.match(page, /Wymaga ponownego rozliczenia/);
  assert.match(page, /Kaucja została pobrana razem z płatnością za rezerwację, ale jest rozliczana oddzielnie i nie generuje cashbacku/);
});

test("buyer sees retained amount and seller resolution note", () => {
  assert.match(page, /deposit_retained_gross/);
  assert.match(page, /deposit_resolution_note/);
  assert.match(page, /Informacja sprzedawcy/);
});
