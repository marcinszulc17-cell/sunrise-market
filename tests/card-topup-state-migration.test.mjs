import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260830144910_card_topup_mysunrise_state.sql", import.meta.url),
  "utf8",
);

test("top-up credit attempts and errors are observable", () => {
  assert.match(migration, /credit_attempts integer not null default 0/);
  assert.match(migration, /last_error text/);
  assert.match(migration, /wallet_topups_credit_retry_idx/);
});
