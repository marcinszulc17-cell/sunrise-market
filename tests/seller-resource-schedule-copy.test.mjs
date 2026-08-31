import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_schedule_copy_bulk.sql', import.meta.url), 'utf8');

test('seller can copy the current weekly schedule to selected resources', () => {
  assert.match(page, /seller_booking_resources_schedule_copy/);
  assert.match(page, /Skopiuj grafik/);
  assert.match(page, /p_source: selected/);
  assert.match(page, /p_targets: checkedResources/);
});

test('schedule copy is bounded and owner/operator checked', () => {
  assert.match(migration, /cardinality\(p_targets\)>100/);
  assert.match(migration, /r\.seller_id=v_seller or market\.is_operator\(\)/);
  assert.match(migration, /delete from market\.booking_resource_availability/);
  assert.match(migration, /join market\.booking_resource_availability a on a\.resource_id=p_source/);
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_schedule_copy\(uuid,uuid\[\]\) from anon/);
});
