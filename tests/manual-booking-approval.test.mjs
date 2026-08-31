import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_manual_booking_approval_after_payment.sql', import.meta.url), 'utf8');
const buyer = fs.readFileSync(new URL('../src/pages/Rezerwacje.tsx', import.meta.url), 'utf8');

test('paid booking honors instant_booking instead of always confirming', () => {
  assert.match(migration, /instant_booking/);
  assert.match(migration, /when v_instant then 'confirmed'/);
  assert.match(migration, /else 'pending_payment'/);
  assert.match(migration, /9999-12-31/);
});

test('paid manual-approval bookings cannot be expired or released as unpaid', () => {
  const guards = migration.match(/and paid_at is null;/g) || [];
  assert.ok(guards.length >= 2);
  assert.match(migration, /seller_booking_set_status/);
  assert.match(migration, /status='confirmed',hold_expires_at=null/);
});

test('buyer sees a clear paid-awaiting-approval state', () => {
  assert.match(buyer, /Opłacona — czeka na akceptację/);
  assert.match(buyer, /termin nadal zarezerwowany dla Ciebie/);
  assert.match(buyer, /Jeśli oferta ma automatyczne potwierdzanie/);
});
