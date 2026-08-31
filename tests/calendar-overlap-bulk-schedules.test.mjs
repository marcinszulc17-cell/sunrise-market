import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const calendar = fs.readFileSync(new URL('../src/components/SellerBookingCalendar.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resources_schedule_bulk.sql', import.meta.url), 'utf8');

test('seller calendar loads resource schedules in one bulk RPC', () => {
  assert.match(calendar, /seller_booking_resources_schedule_bulk/);
  assert.doesNotMatch(calendar, /seller_booking_resource_schedule\"/);
  assert.doesNotMatch(calendar, /Promise\.all\(resources\.map/);
});

test('overlapping appointment events are assigned to side-by-side lanes', () => {
  assert.match(calendar, /function layoutTimedEvents/);
  assert.match(calendar, /laneEnds\.findIndex/);
  assert.match(calendar, /left:`calc\(\$\{lane\*100\/lanes\}% \+ 4px\)`/);
  assert.match(calendar, /width:`calc\(\$\{100\/lanes\}% - 8px\)`/);
});

test('bulk schedule RPC stays authenticated-only', () => {
  assert.match(migration, /seller_booking_resources_schedule_bulk/);
  assert.match(migration, /revoke all on function market\.seller_booking_resources_schedule_bulk\(\) from public/i);
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_schedule_bulk\(\) from anon/i);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_schedule_bulk\(\) to authenticated/i);
});
