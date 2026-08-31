import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modal = fs.readFileSync("src/components/BookingPurchaseModal.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260831170000_booking_deposit_lifecycle.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/booking-deposit-action/index.ts", "utf8");
const panel = fs.readFileSync("src/components/SellerBookingDepositPanel.tsx", "utf8");

test("booking charges deposit but excludes it from cashback and commission", () => {
  assert.match(modal, /const paymentTotal = total \+ deposit;/);
  assert.match(modal, /cashbackFor\(total, cashbackRate\)/);
  assert.match(modal, /zl\(paymentTotal\)/);
  assert.match(modal, /Nie podlega cashbackowi ani prowizjom/);
  assert.match(migration, /amount_gross\+coalesce\(v_booking\.deposit_gross,0\)/);
  assert.match(migration, /v_booking\.amount_gross\*v_cashback_rate/);
  assert.match(migration, /v_model='mlm_full'/);
});

test("seller can refund or retain paid booking deposit", () => {
  assert.match(edge, /stripe\.refunds\.create/);
  assert.match(edge, /payCredit\(String\(row\.buyer_email\)/);
  assert.match(edge, /payCredit\(String\(row\.seller_email\)/);
  assert.match(panel, /Zwróć kaucję/);
  assert.match(panel, /Zatrzymaj kaucję/);
});
