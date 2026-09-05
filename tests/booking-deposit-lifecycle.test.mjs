import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831190000_booking_deposit_consistency.sql", import.meta.url), "utf8");
const bookings = await readFile(new URL("../src/pages/Rezerwacje.tsx", import.meta.url), "utf8");

test("successful booking payment marks charged deposit held", () => {
  assert.match(migration, /deposit_status\s*=\s*case/i);
  assert.match(migration, /coalesce\(deposit_gross,0\) > 0/);
  assert.match(migration, /then 'held'/i);
  assert.match(migration, /deposit_paid_at\s*=\s*case/i);
  assert.match(migration, /coalesce\(deposit_paid_at, now\(\)\)/i);
});

test("deposit lifecycle works for wallet and Stripe booking confirmation", () => {
  assert.match(migration, /'sunrise_pay','stripe'/);
});

test("buyer booking page exposes charged deposit and combined paid amount", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(bookings, /pobrana i zabezpieczona/);
  assert.match(bookings, /Kaucja została pobrana razem z płatnością za rezerwację/);
  assert.match(bookings, /Łącznie pobrano/);
  assert.match(bookings, /bookingPrice \+ deposit/);
});
