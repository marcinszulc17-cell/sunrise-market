import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_booking_refund_settlement_lock.sql", import.meta.url), "utf8");
const fn = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");

test("paid booking refund locks seller settlement until refund finalizes", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
  assert.match(migration, /booking_refund_abort/);
  assert.match(migration, /available_at is not null then 'scheduled' else 'pending'/);
});

test("refund endpoint releases settlement lock when refund aborts", () => {
  assert.match(fn, /async function abortRefund/);
  assert.match(fn, /service\.rpc\("booking_refund_abort"/);
  assert.match(fn, /if \(!paymentRefunded\) await abortRefund\(message\)/);
  assert.match(fn, /points_already_used/);
});
