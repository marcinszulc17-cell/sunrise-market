import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const market = await readFile(new URL("../src/pages/Market.tsx", import.meta.url), "utf8");

test("floating right-corner filter dock is removed", () => {
  assert.doesNotMatch(main, /MarketSmartFilterDock/);
  assert.doesNotMatch(market, /fixed\s+bottom-\d+\s+right-\d+/);
});

test("universal filters live beside every offer list", () => {
  assert.match(market, /Filtry ofert/);
  assert.match(market, /Działają w całym Sunrise Market/);
  for (const label of ["Dział", "Kategoria", "Podkategoria", "Cena od", "Cena do", "Sortowanie"]) {
    assert.match(market, new RegExp(`>${label}<`));
  }
});

test("clearing filters resets category, price, sorting and query", () => {
  assert.match(market, /function clearFilters\(\)/);
  assert.match(market, /setActiveDept\(null\)/);
  assert.match(market, /setPMin\(""\)/);
  assert.match(market, /setSort\("trafnosc"\)/);
  assert.match(market, /load\(null, null, "trafnosc"/);
});
