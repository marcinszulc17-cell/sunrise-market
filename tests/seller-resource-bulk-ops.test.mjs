import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_bulk_ops.sql', import.meta.url), 'utf8');

test('seller resource page supports bulk selection and operations', () => {
  assert.match(page, /checkedResources/);
  assert.match(page, /Zaznacz widoczne/);
  assert.match(page, /seller_booking_resources_set_active/);
  assert.match(page, /seller_booking_resources_time_off_add/);
  assert.match(page, /Dodaj niedostępność do zaznaczonych/);
});

test('bulk RPCs are bounded, owner-checked and authenticated-only', () => {
  assert.match(migration, /cardinality\(p_resources\)>100/);
  assert.match(migration, /r\.seller_id=v_seller or market\.is_operator\(\)/);
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_set_active\(uuid\[\],boolean\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_time_off_add\(uuid\[\],timestamptz,timestamptz,text\) to authenticated/);
});
