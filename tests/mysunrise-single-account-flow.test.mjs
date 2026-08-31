import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const login = fs.readFileSync(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');
const sso = fs.readFileSync(new URL('../src/pages/Sso.tsx', import.meta.url), 'utf8');
const booking = fs.readFileSync(new URL('../src/lib/bookingV2.ts', import.meta.url), 'utf8');
const checkout = fs.readFileSync(new URL('../src/lib/invoiceCheckout.ts', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../supabase/migrations/20260831214500_require_verified_mysunrise_customers.sql', import.meta.url), 'utf8');

test('Sunrise Market has no standalone customer registration', () => {
  assert.doesNotMatch(login, /signUp\s*\(/);
  assert.doesNotMatch(login, /mode\s*===\s*["']register["']/);
  assert.match(login, /Rejestracja odbywa się wyłącznie w MySunrise/);
});

test('SSO refreshes authoritative MySunrise customer status', () => {
  assert.match(sso, /refreshCustomerAccess\(\)/);
  assert.match(sso, /verifyOtp/);
});

test('checkout and booking revalidate MySunrise access immediately before transaction', () => {
  assert.match(checkout, /await refreshCustomerAccess\(\)/);
  assert.match(booking, /await refreshCustomerAccess\(\)/);
});

test('database rejects order and booking inserts without fresh verified MySunrise status', () => {
  assert.match(guard, /trg_verified_customer_orders/);
  assert.match(guard, /trg_verified_customer_bookings/);
  assert.match(guard, /checked_at > now\(\) - interval '30 minutes'/);
  assert.match(guard, /require_verified_customer/);
});
