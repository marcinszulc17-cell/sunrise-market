import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(new URL("../supabase/functions/checkout/index.ts", import.meta.url), "utf8");
const stripe = await readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8");
const retry = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

test("seller payout retry preserves the original idempotency namespace for each payment provider", () => {
  assert.match(checkout, /6ba7b810-9dad-11d1-80b4-00f048300c8/);
  assert.match(stripe, /6ba7b810-9dad-11d1-80b4-00c04fd430c8/);
  assert.match(retry, /SUNRISE_PAY_PAYOUT_NS = "6ba7b810-9dad-11d1-80b4-00f048300c8"/);
  assert.match(retry, /STRIPE_PAYOUT_NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"/);
  assert.match(retry, /select\("payment_provider"\)/);
  assert.match(retry, /provider === "stripe" \? STRIPE_PAYOUT_NS : SUNRISE_PAY_PAYOUT_NS/);
  assert.match(checkout, /market:seller:\$\{orderId\}:\$\{sellerId\}/);
  assert.match(stripe, /market:seller:\$\{orderId\}:\$\{sellerId\}/);
  assert.match(retry, /market:seller:\$\{row\.order_id\}:\$\{row\.seller_id\}/);
});
