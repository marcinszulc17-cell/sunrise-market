import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const searchPage = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831190000_search_purchase_mode_filter.sql", import.meta.url), "utf8");

test("universal search offers purchase, appointment and rental modes across categories", () => {
  assert.match(searchPage, /label:"Kup"/);
  assert.match(searchPage, /label:"Usługi"/);
  assert.match(searchPage, /label:"Wynajem"/);
  assert.match(searchPage, /rpcFilters\.purchase_mode=mode/);
});

test("database filters by private purchase_mode without exposing it", () => {
  assert.match(migration, /p_filters \? 'purchase_mode'/);
  assert.match(migration, /coalesce\(nullif\(o\.attributes->>'purchase_mode',''\),'purchase'\)/);
  assert.match(migration, /- 'purchase_mode'/);
});