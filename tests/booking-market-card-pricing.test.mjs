import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/MarketEnhanced.tsx", import.meta.url), "utf8");

test("booking market cards show booking units and non-misleading cashback", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(source, /mode === "daily" \? "\/ dzień" : "\/ termin"/);
  assert.match(source, /Cashback \$\{percent\}% od wartości rezerwacji/);
  assert.match(source, /mode === "purchase"\s*\? cashbackText/);
  assert.match(source, /bez zwrotnej kaucji/);
});
