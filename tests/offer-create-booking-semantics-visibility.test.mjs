import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/20260831203000_offer_create_booking_semantics_and_visibility.sql", import.meta.url), "utf8");

test("booking modes stay hidden until calendar activation", () => {
  assert.match(sql, /v_status := case when v_mode in \('appointment','daily'\) then 'paused' else 'active' end;/);
});

test("generic booking modes receive semantic offer types", () => {
  assert.match(sql, /when v_mode='appointment' then 'service'/);
  assert.match(sql, /when v_mode='daily' then 'rental'/);
  assert.match(sql, /if v_offer_type='product' then/);
});

test("seller commission model remains unchanged by booking mode", () => {
  assert.match(sql, /p_commission_model not in \('cashback_only','mlm_full'\)/);
  assert.match(sql, /p_commission_model,v_attrs/);
});
