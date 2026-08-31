import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');
const bookingLib = fs.readFileSync(new URL('../src/lib/bookingV2.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_dynamic_cashback.sql', import.meta.url), 'utf8');

test('booking modal uses the cashback rate returned by the booking catalog', () => {
  assert.match(modal, /cashbackFor\(total, Number\(activeConfig\.cashback_rate \|\| 0\)\)/);
  assert.doesNotMatch(modal, /total \* 0\.03/);
  assert.doesNotMatch(modal, /getMarketConfig/);
  assert.match(bookingLib, /cashback_rate: number/);
});

test('booking checkout and public catalog share platform cashback configuration', () => {
  assert.match(migration, /'cashback_rate'/);
  assert.match(migration, /v_cashback_rate/);
  assert.match(migration, /cashback_amount/);
  assert.match(migration, /round\(v_booking\.amount_gross \* v_cashback_rate, 2\)/);
});
