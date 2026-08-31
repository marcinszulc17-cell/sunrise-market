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
  assert.match(calendar, /laneCount=Math\.max\(1,laneEnds\.length\)/);
  assert.match(calendar, /const width=100\/laneCount,left=lane\*width/);
  assert.match(calendar, /left:`calc\(\$\{left\}% \+ 4px\)`/);
  assert.match(calendar, /width:`calc\(\$\{width\}% - 6px\)`/);
});

test('bulk schedule RPC stays authenticated-only', () => {
  assert.match(migration, /seller_booking_resources_schedule_bulk/);
  assert.match(migration, /if auth\.uid\(\) is null then raise exception 'Brak autoryzacji'/i);
  assert.match(migration, /revoke all on function market\.seller_booking_resources_schedule_bulk\(\) from public/i);
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_schedule_bulk\(\) from anon/i);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_schedule_bulk\(\) to authenticated/i);
});
