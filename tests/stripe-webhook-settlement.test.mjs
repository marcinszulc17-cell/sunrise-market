import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url),
  "utf8",
);

test("card settlements use the MySunrise settlement ledger and pay-credit", () => {
  assert.match(source, /from\("seller_settlements"\)\.upsert/);
  assert.match(source, /pay\("pay-credit",/);
  assert.match(source, /idempotency_key:\s*idem/);
  assert.doesNotMatch(source, /credit_seller_payouts/);
});

test("the MySunrise service token is required from the environment", () => {
  assert.match(source, /Deno\.env\.get\("SUNRISE_MARKET_SERVICE_TOKEN"\)/);
  assert.match(source, /if \(!PAY_TOKEN\) throw new Error/);
  assert.doesNotMatch(source, /SUNRISE_MARKET_SERVICE_TOKEN"\)\s*\?\?/);
});

test("card orders do not apply the Sunrise Pay fee", () => {
  const cardHandler = source.slice(
    source.indexOf("async function settleCardOrder"),
    source.indexOf("Deno.serve"),
  );
  assert.doesNotMatch(cardHandler, /apply_sunrise_pay_fee/);
});
