import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_daily_multi_resource_rentals.sql', import.meta.url), 'utf8');

test('daily rental helper is internal and resource-aware', () => {
  assert.match(migration, /booking_daily_resource_available/);
  assert.match(migration, /booking_offer_resources/);
  assert.match(migration, /booking_resource_time_off/);
  assert.match(migration, /b\.resource_id=p_resource or b\.resource_id is null/);
  assert.match(migration, /revoke execute on function market\.booking_daily_resource_available\([\s\S]*\) from anon, authenticated/);
});

test('unavailable days block only when every mapped resource is unavailable', () => {
  assert.match(migration, /v_has_resources/);
  assert.match(migration, /not exists \([\s\S]*booking_daily_resource_available\(p_offer,r\.id,d\.starts_at,d\.ends_at\)/);
  assert.match(migration, /not v_has_resources[\s\S]*market\.bookings/);
});

test('daily quote requires one free resource for the entire stay and honors seasonal minimums', () => {
  assert.match(migration, /daterange\(rr\.starts_on,rr\.ends_on,'\[\]'\)[\s\S]*daterange\(p_from,p_to-1,'\[\]'\)/);
  assert.match(migration, /booking_daily_resource_available\(p_offer,r\.id,v_start,v_end\)/);
  assert.match(migration, /Brak jednego wolnego zasobu przez cały wybrany okres/);
});

test('daily hold serializes allocation and stores auto-selected concrete resource', () => {
  assert.match(migration, /p_offer::text\|\|':daily'/);
  assert.match(migration, /select r\.id into v_resource/);
  assert.match(migration, /order by r\.name,r\.id/);
  assert.match(migration, /values\([\s\S]*p_service,v_resource\)/);
  assert.match(migration, /revoke execute on function market\.create_booking_hold_v2\([\s\S]*\) from anon/);
  assert.match(migration, /grant execute on function market\.create_booking_hold_v2\([\s\S]*\) to authenticated/);
});
