import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manage = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const calendar = fs.readFileSync(new URL('../src/components/SellerBookingCalendar.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_dashboard.sql', import.meta.url), 'utf8');

test('seller booking dashboard exposes resource data', () => {
  assert.match(manage, /seller_booking_dashboard_v2/);
  assert.match(manage, /seller_booking_resources_dashboard/);
  assert.match(manage, /resource_name/);
  assert.match(migration, /resource_id uuid/);
  assert.match(migration, /resource_name text/);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_dashboard\(\) to authenticated/);
});

test('calendar renders resource columns', () => {
  assert.match(calendar, /"resources"/);
  assert.match(calendar, /ResourceTimeline/);
  assert.match(calendar, /Bez przypisanego zasobu/);
  assert.match(calendar, /resourceId/);
  assert.match(calendar, /Pracownik/);
  assert.match(calendar, /Pojazd/);
  assert.match(calendar, /Sprzęt/);
});
