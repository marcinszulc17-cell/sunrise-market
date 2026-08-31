import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_booking_refund_settlement_lock.sql", import.meta.url), "utf8");
const refundFn = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const retryFn = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

test("paid booking refund locks seller settlement until refund finalizes", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /processing/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
  assert.match(migration, /status='processing'/);
  assert.match(migration, /booking_refund_abort/);
  assert.match(migration, /available_at is not null then 'scheduled' else 'pending'/);
});

test("refund endpoint releases settlement lock when refund aborts", () => {
  assert.match(refundFn, /async function abortRefund/);
  assert.match(refundFn, /service\.rpc\("booking_refund_abort"/);
  assert.match(refundFn, /if \(!paymentRefunded\) await abortRefund\(message\)/);
  assert.match(refundFn, /points_already_used/);
});

test("seller settlement worker atomically claims a payout before calling Sunrise Pay", () => {
  assert.match(retryFn, /status: "processing"/);
  assert.match(retryFn, /\.eq\("id", row\.id\)\.eq\("status", row\.status\)\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(retryFn, /if \(!claimed\) \{ skipped\+\+; continue; \}/);
  assert.match(retryFn, /eq\("status", "processing"\)/);
  assert.match(retryFn, /Stary claim wypłaty został zwolniony do ponowienia/);
});
