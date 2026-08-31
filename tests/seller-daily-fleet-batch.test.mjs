import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const setup = fs.readFileSync(new URL('../src/pages/SellerBookingSetup.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_resource_batch_create.sql', import.meta.url), 'utf8');

test('daily booking setup can add a fleet in one action', () => {
  assert.match(setup, /resourceCount/);
  assert.match(setup, /seller_booking_resources_batch_create/);
  assert.match(setup, /Liczba sztuk/);
  assert.match(setup, /Dodaj \$\{resourceCount\} egzemplarzy/);
  assert.match(setup, /automatycznie przydzieli klientowi konkretny wolny egzemplarz/);
});

test('batch creation is server-side, bounded, offer-owned and collision-safe', () => {
  assert.match(migration, /p_count integer default 1/);
  assert.match(migration, /v_count < 1 or v_count > 50/);
  assert.match(migration, /o\.id=p_offer and o\.seller_id=v_seller/);
  assert.match(migration, /while v_created < v_count loop/);
  assert.match(migration, /lower\(trim\(r\.name\)\)=lower\(v_name\)/);
  assert.match(migration, /v_base\|\|' #'\|\|v_suffix::text/);
  assert.match(migration, /booking_offer_resources/);
});

test('batch creation is unavailable to anonymous callers', () => {
  assert.match(migration, /revoke execute on function market\.seller_booking_resources_batch_create[\s\S]*from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_resources_batch_create[\s\S]*to authenticated/);
});
