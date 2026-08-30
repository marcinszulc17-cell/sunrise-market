import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const market = await readFile(new URL("../src/pages/Market.tsx", import.meta.url), "utf8");

test("category filters are generated from the shared category attribute definitions", () => {
  assert.match(market, /from\("category_attributes"\)/);
  assert.match(market, /Parametry kategorii/);
  for (const type of ["bool", "enum", "number"]) assert.match(market, new RegExp(`data_type === "${type}"`));
});

test("attribute filtering uses sanitized public offer attributes", () => {
  assert.match(api, /searchOffersWithAttributes/);
  assert.match(api, /search_offers_v2/);
  assert.match(market, /matchesAttributeFilters/);
  for (const privateKey of ["vin", "registration_number", "kw_number", "purchase_mode"]) {
    assert.match(market, new RegExp(`"${privateKey}"`));
  }
});

test("numeric attributes support ranges and every category change clears stale values", () => {
  assert.match(market, /rawKey\.endsWith\("_min"\)/);
  assert.match(market, /rawKey\.endsWith\("_max"\)/);
  assert.match(market, /setAttrFilters\(\{\}\)/);
});
