import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const lib = fs.readFileSync(new URL('../src/lib/bookingV2.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_daily_quote_bulk.sql', import.meta.url), 'utf8');

test('daily quote uses one range RPC instead of one RPC per day', () => {
  assert.match(lib, /booking_daily_quote_v2/);
  assert.doesNotMatch(lib, /for\s*\(let i = 0; i < days; i\+\+\)/);
  assert.doesNotMatch(lib, /booking_price_for_day/);
});

test('bulk daily quote prices the whole range server-side with bounded input', () => {
  assert.match(migration, /generate_series/);
  assert.match(migration, /booking_price_for_day\(p_offer, d::date\)/);
  assert.match(migration, /v_days > 366/);
  assert.match(migration, /b\.booking_type='daily'/);
  assert.match(migration, /o\.status='active'/);
  assert.match(migration, /s\.status='active'/);
});

test('public quote RPC is limited to buyer-facing roles', () => {
  assert.match(migration, /revoke all on function market\.booking_daily_quote_v2\(uuid,date,date\) from public/);
  assert.match(migration, /grant execute on function market\.booking_daily_quote_v2\(uuid,date,date\) to anon, authenticated/);
});
