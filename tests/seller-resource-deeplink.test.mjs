import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const bookings = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const schedules = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');

test('booking resource name links directly to its schedule', () => {
  assert.match(bookings, /rezerwacje\/grafiki\?resource=\$\{encodeURIComponent\(r\.resource_id\)\}/);
  assert.match(bookings, /otwórz grafik/);
});

test('resource schedules honor and maintain the resource query parameter', () => {
  assert.match(schedules, /useSearchParams/);
  assert.match(schedules, /params\.get\("resource"\)/);
  assert.match(schedules, /rows\.some\(r=>r\.id===requestedResource\)\?requestedResource/);
  assert.match(schedules, /setParams\(id\?\{resource:id\}:\{\},\{replace:true\}\)/);
});
