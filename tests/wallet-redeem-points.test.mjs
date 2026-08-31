import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const payments = fs.readFileSync(new URL('../src/lib/payments.ts', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../supabase/functions/wallet-redeem-points/index.ts', import.meta.url), 'utf8');

test('point redemption uses the live Market to MySunrise bridge with idempotency', () => {
  assert.match(payments, /wallet-redeem-points/);
  assert.match(payments, /crypto\.randomUUID\(\)/);
  assert.match(payments, /idempotency_key: idempotencyKey/);
  assert.doesNotMatch(payments, /Dopóki MySunrise nie wystawi endpointu/);
});

test('Market bridge keeps MySunrise credentials server-side', () => {
  assert.match(bridge, /SUNRISE_MARKET_SERVICE_TOKEN/);
  assert.match(bridge, /X-Sunrise-Service-Token/);
  assert.match(bridge, /pay-convert-points/);
  assert.match(bridge, /userClient\.auth\.getUser\(\)/);
  assert.doesNotMatch(bridge, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('linked-account and domain errors do not masquerade as unavailable feature', () => {
  assert.match(bridge, /user_not_found[^\n]+available: true/);
  assert.match(bridge, /no_points[^\n]+available: true/);
});
