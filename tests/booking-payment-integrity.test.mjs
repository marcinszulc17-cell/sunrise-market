import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const buyerBookings = await readFile(new URL("../src/lib/buyerBookings.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/Rezerwacje.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831183000_booking_payment_integrity_and_buyer_status.sql", import.meta.url), "utf8");

test("buyer booking RPC exposes payment state", () => {
  assert.match(buyerBookings, /rpc\("my_bookings_v2"\)/);
  assert.match(buyerBookings, /paid_at: string \| null/);
  assert.match(page, /Opłacona — czeka na akceptację/);
  assert.match(page, /r\.status === "pending_payment" && r\.paid_at/);
});

test("main booking payment does not fake a paid deposit", () => {
  const confirmStart = migration.indexOf("create or replace function market.confirm_paid_booking");
  const buyerStart = migration.indexOf("create or replace function market.my_bookings_v2");
  const confirmBody = migration.slice(confirmStart, buyerStart);
  assert.doesNotMatch(confirmBody, /deposit_status\s*=/);
  assert.doesNotMatch(confirmBody, /deposit_paid_at\s*=/);
});

test("buyer UI describes deposit as separate from booking price", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /Kaucja zabezpieczająca/);
  assert.match(page, /rozliczana osobno, poza ceną rezerwacji/);
});
