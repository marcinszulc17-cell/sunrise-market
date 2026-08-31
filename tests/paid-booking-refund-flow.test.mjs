import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const depositEdge = await readFile(new URL("../supabase/functions/booking-deposit-action/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831183000_paid_booking_refund_flow.sql", import.meta.url), "utf8");

test("paid booking refund reverses bonuses before refund and restores them if payment refund fails", () => {
  const reverse = edge.indexOf('bridge("reverse", orderId)');
  const sunriseRefund = edge.indexOf('payCredit(buyerEmail, amountGrosz, orderId, idem)');
  const stripeRefund = edge.indexOf('stripe.refunds.create');
  const restore = edge.indexOf('bridge("restore", orderId)');
  assert.ok(reverse >= 0);
  assert.ok(sunriseRefund > reverse);
  assert.ok(stripeRefund > reverse);
  assert.ok(restore > reverse);
  assert.match(edge, /status: "bonuses_reversed"/);
  assert.match(edge, /booking_refund_abort/);
  assert.match(edge, /uuidv5\(`booking-full-refund:\$\{bookingId\}`\)/);
});

test("paid booking cannot be cancelled through the plain status action", () => {
  assert.match(migration, /if v\.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności\.'/);
});

test("refund preparation blocks seller settlement and abort restores it", () => {
  assert.match(migration, /refund_pending/);
  assert.match(migration, /status in \('scheduled','pending','failed'\)/);
  assert.match(migration, /booking_refund_abort/);
  assert.match(migration, /status=case when available_at is not null then 'scheduled' else 'pending' end/);
});

test("refund preparation blocks paid-out settlements and separately resolved deposits", () => {
  assert.match(migration, /s\.status='settled'/);
  assert.match(migration, /deposit_status,'not_charged'\) not in \('held','not_charged'\)/);
});

test("refund finalizer cancels order and seller settlement only after bonuses were reversed", () => {
  assert.match(migration, /if r\.status<>'bonuses_reversed'/);
  assert.match(migration, /update market\.orders set status='cancelled'/);
  assert.match(migration, /update market\.seller_settlements set status='cancelled'/);
  assert.match(migration, /status='reversed'/);
  assert.match(migration, /grant execute on function market\.booking_refund_finalize\(uuid,text\) to service_role/);
});

test("Sunrise Pay deposit refund and retain use deterministic UUID idempotency keys", () => {
  assert.match(depositEdge, /uuidv5\(`booking-deposit-refund:\$\{bookingId\}`\)/);
  assert.match(depositEdge, /uuidv5\(`booking-deposit-retain:\$\{bookingId\}`\)/);
});
