import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_dynamic_cashback.sql', import.meta.url), 'utf8');

test('booking public catalog exposes platform cashback rate', () => {
  assert.match(migration, /booking_public_catalog/);
  assert.match(migration, /'cashback_rate'/);
  assert.match(migration, /platform_config pc where pc\.key='cashback_rate'/);
});

test('booking checkout persists configured cashback on the order', () => {
  assert.match(migration, /v_cashback_rate/);
  assert.match(migration, /cashback_amount/);
  assert.match(migration, /round\(v_booking\.amount_gross \* v_cashback_rate, 2\)/);
});

test('booking checkout remains service-role only', () => {
  assert.match(migration, /revoke execute on function market\.checkout_booking\(uuid,uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function market\.checkout_booking\(uuid,uuid\) to service_role/i);
});
