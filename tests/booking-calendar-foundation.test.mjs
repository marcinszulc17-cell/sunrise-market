import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260830155357_booking_calendar_foundation.sql", import.meta.url),
  "utf8",
);
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("one booking engine supports appointments and daily rentals", () => {
  for (const table of ["booking_offers", "booking_availability", "bookings"]) {
    assert.match(migration, new RegExp(`create table if not exists market\\.${table}`));
  }
  assert.match(migration, /booking_type in \('appointment','daily'\)/);
  assert.match(migration, /order_id uuid unique references market\.orders/);
});

test("slot holds are authenticated, short-lived and serialized per offer", () => {
  assert.match(migration, /create_booking_hold/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /tstzrange\(x\.starts_at, x\.ends_at, '\[\)'\)/);
  assert.match(migration, /revoke execute on function market\.create_booking_hold.*public, anon/i);
  assert.match(migration, /grant execute on function market\.create_booking_hold.*authenticated/i);
});

test("booking tables are private and exposed through narrow RPCs", () => {
  for (const table of ["booking_offers", "booking_availability", "bookings"]) {
    assert.match(migration, new RegExp(`alter table market\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table market\\.${table} from public, anon, authenticated`));
  }
  for (const rpc of ["booking_public_config", "booking_available_slots", "my_bookings", "seller_bookings"]) {
    assert.match(api, new RegExp(rpc));
  }
});

test("booking keeps the existing marketplace order as the payment anchor", () => {
  assert.match(migration, /Payment stays in the existing orders\/checkout flow/);
  assert.doesNotMatch(migration, /wallet_mirror|wallet_balance|credit_seller_payouts/);
  assert.doesNotMatch(api, /bookingWallet|bookingPaymentProvider/);
});
