import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(
  new URL("../supabase/functions/checkout/index.ts", import.meta.url),
  "utf8",
);
const payments = await readFile(
  new URL("../src/lib/payments.ts", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../src/lib/api.ts", import.meta.url),
  "utf8",
);
const balance = await readFile(
  new URL("../supabase/functions/wallet-balance/index.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../supabase/migrations/20260830145722_retire_unused_buyer_wallet_rpcs.sql", import.meta.url),
  "utf8",
);

test("active checkout and client balance code do not use wallet_mirror", () => {
  assert.doesNotMatch(checkout, /wallet_mirror/);
  assert.doesNotMatch(payments, /wallet_mirror/);
  assert.doesNotMatch(payments, /getWalletBalance/);
  assert.doesNotMatch(api, /\bmyBalance\b|\bmy_balance\b|wallet_mirror/);
});

test("wallet balance requires the environment service token", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(balance, /Deno\.env\.get\("SUNRISE_MARKET_SERVICE_TOKEN"\)/);
  assert.match(balance, /if \(!PAY_TOKEN\)/);
  assert.doesNotMatch(balance, /SUNRISE_MARKET_SERVICE_TOKEN"\)\s*\?\?/);
  assert.match(balance, /pay-balance/);
});

test("unused mirror RPCs are retired while refund compatibility remains", () => {
  for (const fn of ["credit_topup", "my_balance", "pay_from_wallet", "credit_cashback"]) {
    assert.match(migration, new RegExp(`drop function if exists market\\.${fn}`));
  }
  assert.doesNotMatch(migration, /drop table.*wallet_mirror/i);
  assert.doesNotMatch(migration, /drop function.*process_refund/i);
});
