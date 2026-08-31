import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/20260831202000_public_purchase_mode_search_v2.sql", import.meta.url), "utf8");

test("search v2 returns purchase_mode while keeping private identifiers hidden", () => {
  assert.match(sql, /coalesce\(o\.attributes,'\{\}'::jsonb\)/);
  assert.doesNotMatch(sql, /- 'purchase_mode'/);
  assert.match(sql, /- 'vin'/);
  assert.match(sql, /- 'registration_number'/);
  assert.match(sql, /- 'kw_number'/);
});

test("purchase mode remains filterable for sale appointment and rental views", () => {
  assert.match(sql, /p_filters \? 'purchase_mode'/);
  assert.match(sql, /o\.attributes->>'purchase_mode'/);
});