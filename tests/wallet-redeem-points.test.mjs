import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const payments = fs.readFileSync(new URL('../src/lib/payments.ts', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../supabase/functions/wallet-redeem-points/index.ts', import.meta.url), 'utf8');

test('point redemption uses the live Market to MySunrise bridge with idempotency', () => {
  assert.match(payments, /wallet-redeem-points/);
  assert.match(payments, /idempotency_key: idempotencyKey/);
  assert.match(bridge, /idempotency_key: requestId/);
  assert.match(bridge, /points: amount/);
  assert.doesNotMatch(payments, /Dopóki MySunrise nie wystawi endpointu/);
});

test('Market bridge resolves identity from JWT and keeps MySunrise credentials server-side', () => {
  assert.match(bridge, /SUNRISE_MARKET_SERVICE_TOKEN/);
  assert.match(bridge, /X-Sunrise-Service-Token/);
  assert.match(bridge, /pay-convert-points/);
  assert.match(bridge, /userClient\.auth\.getUser\(\)/);
  assert.match(bridge, /user_ref: user\.email/);
  assert.doesNotMatch(bridge, /body\.user_ref/);
  assert.doesNotMatch(bridge, /body\.email/);
  assert.doesNotMatch(bridge, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('point amount is validated before conversion', () => {
  assert.match(bridge, /Number\.isFinite\(amount\)/);
  assert.match(bridge, /amount <= 0/);
});

test('retry key survives uncertain failures and is isolated per user and amount', () => {
  assert.match(payments, /redeemAttemptStorageKey\(user\?\.id \?\? "anonymous", amount\)/);
  assert.match(payments, /getStoredAttempt\(storageKey\) \?\? crypto\.randomUUID\(\)/);
  assert.match(payments, /saveAttempt\(storageKey, idempotencyKey\)/);
  assert.ok(payments.indexOf('clearAttempt(storageKey)') > payments.indexOf('if (data)'));
});

test('linked-account and domain errors do not masquerade as unavailable feature', () => {
  assert.match(bridge, /user_not_found[^\n]+available: true/);
  assert.match(bridge, /no_points[^\n]+available: true/);
  assert.match(payments, /return \{ available: true, error: error\.message/);
  assert.doesNotMatch(payments, /if \(error \|\| !data\) return \{ available: false \}/);
});
