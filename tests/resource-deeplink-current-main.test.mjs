import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const schedules = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/SellerBookingOpsSidebar.tsx', import.meta.url), 'utf8');

test('resource schedules honor and maintain a resource query parameter', () => {
  assert.match(schedules, /useSearchParams/);
  assert.match(schedules, /sp\.get\("resource"\)/);
  assert.match(schedules, /next\.set\("resource",id\)/);
  assert.match(schedules, /seller_booking_resource_update/);
  assert.doesNotMatch(schedules, /seller_booking_resource_upsert/);
});

test('seller booking sidebar links concrete resources directly to their editor', () => {
  assert.match(sidebar, /grafiki\?resource=\$\{encodeURIComponent\(resource\.id\)\}/);
  assert.match(sidebar, /Edytuj →/);
});
