import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidebar = await readFile(new URL("../src/components/SellerBookingOpsSidebar.tsx", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/booking-cancel-refund/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831200000_booking_paid_refund_guards.sql", import.meta.url), "utf8");

test("seller sees dedicated safe refund flow for paid bookings", () => {
  assert.match(sidebar, /booking-cancel-refund/);
  assert.match(sidebar, /Anuluj i zwróć/);
  assert.match(sidebar, /Opłacona — do akceptacji/);
  assert.match(edge, /bridge\("reverse", orderId\)/);
  assert.match(edge, /bridge\("restore", orderId\)/);
});

test("database guards paid cancellation and reverses downstream settlement states", () => {
  assert.match(migration, /Opłaconą rezerwację anuluj przez zwrot płatności\./);
  assert.match(migration, /seller_settlements set status='cancelled'/);
  assert.match(migration, /ambassador_commission_outbox set status='reversed'/);
  assert.match(migration, /'ready','sent','failed','pending_vat','pending_identity'/);
  assert.match(migration, /grant execute on function market\.booking_refund_finalize\(uuid,text\) to service_role/);
});