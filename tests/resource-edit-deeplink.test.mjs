import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_allow_resource_upsert_edit_without_offer.sql', import.meta.url), 'utf8');

test('resource schedules support direct resource selection and editing details', () => {
  assert.match(page, /useSearchParams/);
  assert.match(page, /sp\.get\("resource"\)/);
  assert.match(page, /Dane egzemplarza/);
  assert.match(page, /seller_booking_resource_upsert/);
  assert.match(page, /p_offer:null/);
  assert.match(page, /Koniec niedostępności musi być później niż początek/);
});

test('resource upsert keeps offer required on create but optional for owned edit', () => {
  assert.match(migration, /if p_id is null then/);
  assert.match(migration, /if p_offer is null or not exists/);
  assert.match(migration, /where id=p_id and seller_id=v_seller/);
  assert.match(migration, /if p_offer is not null then/);
  assert.match(migration, /revoke execute on function market\.seller_booking_resource_upsert\(uuid,uuid,text,text,text,boolean\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_resource_upsert\(uuid,uuid,text,text,text,boolean\) to authenticated/);
});
