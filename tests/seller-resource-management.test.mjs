import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_management.sql', import.meta.url), 'utf8');

test('resource schedules manage active and inactive seller resources', () => {
  assert.match(page, /seller_booking_resources_manage/);
  assert.match(page, /Aktywny dla nowych rezerwacji/);
  assert.match(page, /Wyłączony/);
  assert.match(page, /seller_booking_resource_update/);
  assert.match(page, /Historia i istniejące rezerwacje pozostają bez zmian/);
});

test('seller can edit resource metadata without deleting booking history', () => {
  assert.match(page, /p_name:edit\.name\.trim\(\)/);
  assert.match(page, /p_kind:edit\.kind/);
  assert.match(page, /p_description:edit\.description\|\|null/);
  assert.match(page, /p_active:edit\.active/);
  assert.doesNotMatch(page, /delete from market\.booking_resources/i);
});

test('resource time off validates end after start', () => {
  assert.match(page, /end<=start/);
  assert.match(page, /Koniec nieobecności musi być później niż jej początek/);
});

test('resource management RPCs are authenticated seller operations', () => {
  assert.match(migration, /seller_booking_resources_manage/);
  assert.match(migration, /seller_booking_resource_update/);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_manage\(\) to authenticated/);
  assert.match(migration, /grant execute on function market\.seller_booking_resource_update\(uuid,text,text,text,boolean\) to authenticated/);
  assert.match(migration, /revoke execute .* from anon/);
});
