import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_resource_schedules.sql', import.meta.url), 'utf8');

assert.match(main, /SellerResourceSchedules/);
assert.match(main, /\/sprzedawca\/rezerwacje\/grafiki/);
assert.match(page, /Grafiki zasobów/);
assert.match(page, /Przerwę ustaw przez dwa okna/);
assert.match(page, /Urlopy i dni wolne/);
assert.match(page, /seller_booking_resource_schedule_replace/);
assert.match(page, /seller_booking_resource_time_off_add/);
assert.match(page, /Przywróć grafik oferty/);
assert.match(migration, /booking_resource_availability/);
assert.match(migration, /booking_resource_time_off/);
assert.match(migration, /booking_resource_time_allowed/);
assert.match(migration, /revoke execute on function market\.seller_booking_resource_schedule/);

console.log('booking resource schedules contract OK');