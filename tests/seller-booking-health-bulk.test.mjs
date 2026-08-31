import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SprzedawcaStart.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_health_bulk.sql', import.meta.url), 'utf8');

test('seller start loads booking health in one RPC', () => {
  assert.match(page, /seller_booking_health_bulk/);
  assert.doesNotMatch(page, /Promise\.all\(\(rows \?\? \[\]\)\.map/);
  assert.doesNotMatch(page, /seller_booking_catalog_v2/);
  assert.match(page, /availability_count/);
});

test('bulk booking health RPC uses real availability and safe grants', () => {
  assert.match(migration, /booking_availability/);
  assert.match(migration, /revoke all on function market\.seller_booking_health_bulk\(\) from public/i);
  assert.match(migration, /revoke execute on function market\.seller_booking_health_bulk\(\) from anon/i);
  assert.match(migration, /grant execute on function market\.seller_booking_health_bulk\(\) to authenticated/i);
});
