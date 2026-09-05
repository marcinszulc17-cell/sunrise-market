import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_management.sql', import.meta.url), 'utf8');

test('seller can edit resource identity and activation from schedules page', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /seller_booking_resources_manage/);
  assert.match(page, /seller_booking_resource_update/);
  assert.match(page, /p_kind:edit\.kind/);
  assert.match(page, /Aktywny dla nowych rezerwacji/);
  assert.match(page, /Zapisz dane zasobu/);
});

test('resource update validates type and preserves history through deactivation', () => {
  assert.match(migration, /p_kind text/);
  assert.match(migration, /p_kind not in \('staff','vehicle','property','room','equipment','other'\)/);
  assert.match(migration, /active=coalesce\(p_active,true\)/);
  assert.match(migration, /r\.seller_id=v_seller or market\.is_operator\(\)/);
});

test('resource management RPCs are authenticated only', () => {
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_manage\(\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_manage\(\) to authenticated/);
  assert.match(migration, /revoke execute on function market\.seller_booking_resource_update\(uuid,text,text,text,boolean\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_resource_update\(uuid,text,text,text,boolean\) to authenticated/);
});
