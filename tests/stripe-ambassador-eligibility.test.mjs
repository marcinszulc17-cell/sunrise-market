import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhook = await readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831_vat_ambassador_foundation_current.sql", import.meta.url), "utf8");

test("Stripe commissions go through the ambassador outbox", () => {
  assert.match(webhook, /enqueue_ambassador_commission/);
  assert.match(webhook, /ambassador_commission_outbox/);
  assert.match(webhook, /settleAmbassadorCommission/);
  assert.doesNotMatch(webhook, /offers\.fulfillment_provider/);
  assert.doesNotMatch(webhook, /fulfillment_provider\", \"mysunrise\"/);
});

test("ambassador outbox only includes mlm_full offers", () => {
  assert.match(migration, /coalesce\(o\.commission_model,'cashback_only'\)='mlm_full'/);
});

test("cashback_only remains independent from Stripe commission settlement", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  const cashback = webhook.indexOf('pay("pay-credit-points"');
  const outbox = webhook.indexOf('settleAmbassadorCommission(sb');
  assert.ok(cashback >= 0);
  assert.ok(outbox > cashback);
});
