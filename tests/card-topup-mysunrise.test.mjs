import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhook = await readFile(
  new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url),
  "utf8",
);
const creator = await readFile(
  new URL("../supabase/functions/wallet-topup/index.ts", import.meta.url),
  "utf8",
);

test("top-up session carries the MySunrise identity", () => {
  assert.match(creator, /user_email:\s*user\.email/);
  assert.match(creator, /customer_email:\s*user\.email/);
});

test("paid top-up credits only MySunrise pay-credit", () => {
  const topupHandler = webhook.slice(
    webhook.indexOf("async function creditTopup"),
    webhook.indexOf("async function settleCardOrder"),
  );
  assert.match(topupHandler, /pay\("pay-credit"/);
  assert.match(topupHandler, /idempotency_key:\s*topupId/);
  assert.doesNotMatch(topupHandler, /wallet_mirror|credit_topup|WALLET_PROVIDER|MYSUNRISE_API_KEY/);
});

test("top-up verifies identity, session, amount and currency", () => {
  assert.match(webhook, /Top-up user mismatch/);
  assert.match(webhook, /Top-up session mismatch/);
  assert.match(webhook, /Top-up amount or currency mismatch/);
});

test("top-up completion is persisted only after MySunrise succeeds", () => {
  const creditCall = webhook.indexOf('pay("pay-credit"');
  const paidUpdate = webhook.indexOf('status: "paid"', creditCall);
  assert.ok(creditCall >= 0 && paidUpdate > creditCall);
  assert.match(webhook, /credited:\s*true/);
  assert.match(webhook, /status:\s*"failed"/);
});
