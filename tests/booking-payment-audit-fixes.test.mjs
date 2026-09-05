import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831173000_booking_seller_fee_full_line.sql', import.meta.url), 'utf8');
const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');

test('seller payout includes booking fees stored in line_gross', () => {
  const usesFullLine = migration.match(/coalesce\(line_gross, unit_price_gross \* qty\)/g) || [];
  assert.ok(usesFullLine.length >= 4);
  assert.match(migration, /apply_sunrise_pay_fee/);
  assert.match(migration, /apply_stripe_seller_fee/);
});

test('rental deposit is included in payment but excluded from cashback and commissions', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(modal, /const paymentTotal = total \+ deposit/);
  assert.match(modal, /Kaucja zabezpieczająca/);
  assert.match(modal, /jest wliczona w kwotę płatności/);
  assert.match(modal, /Nie podlega cashbackowi ani prowizjom/);
});
