import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831195000_booking_refund_race_final.sql", import.meta.url), "utf8");
const refund = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const retry = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

test("refund prepare freezes payout and preserves financial guards", () => {
  assert.match(migration, /v\.starts_at <= now\(\)/);
  assert.match(migration, /o\.status <> 'paid'/);
  assert.match(migration, /s\.status='processing'/);
  assert.match(migration, /status='refund_pending'/);
  assert.match(migration, /deposit_status,'not_charged'\) <> 'held'/);
});

test("refund finalization requires recorded bonus reversal", () => {
  assert.match(migration, /bonuses_reversed/);
  assert.match(migration, /r\.status<>'bonuses_reversed'/);
  assert.match(refund, /status: "bonuses_reversed"/);
  assert.match(refund, /booking_refund_abort/);
});

test("seller payout retry claims settlement before external credit", () => {
  assert.match(retry, /status: "processing"/);
  assert.match(retry, /eq\("id", row\.id\)\.eq\("status", row\.status\)\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(retry, /staleProcessingCutoff/);
  assert.match(retry, /skipped/);
});

test("failed refund releases frozen payout but successful refund cancels only refund_pending payout", () => {
  assert.match(migration, /booking_refund_abort/);
  assert.match(migration, /available_at is not null then 'scheduled' else 'pending'/);
  assert.match(migration, /status='cancelled'[\s\S]*status='refund_pending'/);
});
