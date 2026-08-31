import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_booking_refund_before_start.sql", import.meta.url), "utf8");

test("automatic paid-booking refund is blocked after booking start", () => {
  assert.match(migration, /if v\.starts_at <= now\(\) then raise exception 'Po rozpoczęciu terminu zwrot wymaga ręcznej obsługi operatora'; end if;/);
});
