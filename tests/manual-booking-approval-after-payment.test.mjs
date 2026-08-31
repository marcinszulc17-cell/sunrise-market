import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_manual_booking_approval_after_payment.sql', import.meta.url), 'utf8');

test('paid booking respects instant_booking=false instead of auto-confirming', () => {
  assert.match(migration, /coalesce\(bo\.instant_booking,true\)/);
  assert.match(migration, /when v_instant then 'confirmed'/);
  assert.match(migration, /else 'pending_payment'/);
  assert.match(migration, /paid_at = coalesce\(paid_at, now\(\)\)/);
  assert.match(migration, /timestamptz '9999-12-31 23:59:59\+00'/);
});

test('payment expiry and release never touch a paid booking awaiting seller approval', () => {
  const paidGuardCount = (migration.match(/and paid_at is null/g) || []).length;
  assert.ok(paidGuardCount >= 2);
  assert.match(migration, /expire_booking_payment/);
  assert.match(migration, /release_unpaid_booking/);
});

test('seller can confirm only after payment when amount is positive', () => {
  assert.match(migration, /v\.amount_gross>0 and v\.paid_at is null/);
  assert.match(migration, /update market\.bookings set status='confirmed',hold_expires_at=null/);
});
