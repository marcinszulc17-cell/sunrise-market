import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260830160555_booking_paid_checkout.sql", import.meta.url), "utf8");
const checkout = await readFile(new URL("../supabase/functions/checkout/index.ts", import.meta.url), "utf8");
const webhook = await readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8");
const retry = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");
const modal = await readFile(new URL("../src/components/BookingPurchaseModal.tsx", import.meta.url), "utf8");

test("a booking creates a normal market order without a parallel wallet", () => {
  assert.match(migration, /create or replace function market\.checkout_booking/);
  assert.match(migration, /insert into market\.orders/);
  assert.match(migration, /insert into market\.order_items/);
  assert.doesNotMatch(migration, /wallet_mirror|credit_seller_payouts/);
  assert.match(migration, /grant execute on function market\.checkout_booking.*service_role/i);
});

test("the existing checkout handles Sunrise Pay and Stripe bookings", () => {
  assert.match(checkout, /booking_id/);
  assert.match(checkout, /checkout_booking/);
  assert.match(checkout, /apply_sunrise_pay_fee/);
  assert.match(checkout, /Rezerwacja Sunrise Market/);
  assert.match(checkout, /expires_at: bookingExpiresAt/);
  assert.match(checkout, /idempotencyKey: `market-booking:/);
  assert.match(webhook, /apply_stripe_seller_fee/);
  assert.match(webhook, /confirm_paid_booking/);
  assert.match(webhook, /expire_booking_payment/);
  assert.match(webhook, /pay\("pay-credit-points"/);
});

test("Partner Handlowy payout is released after the booked period", () => {
  assert.match(migration, /'scheduled','pending','settled','failed'/);
  assert.match(checkout, /status: booking \? "scheduled" : "pending"/);
  assert.match(webhook, /status: booking \? "scheduled" : "pending"/);
  assert.match(retry, /available_at/);
  assert.match(retry, /status: "completed"/);
});

test("buyer UI supports appointment slots and daily rental ranges", () => {
  assert.match(modal, /booking_type === "appointment"/);
  assert.match(modal, /type="date"/);
  assert.match(modal, /Sunrise Pay/);
  assert.match(modal, /Karta \/ BLIK \/ P24/);
  assert.match(modal, /checkoutBooking/);
});
