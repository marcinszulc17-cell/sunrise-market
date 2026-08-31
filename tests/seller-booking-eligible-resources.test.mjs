import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const manage = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_eligible_resources.sql', import.meta.url), 'utf8');

test('seller move picker loads only booking-eligible resources', () => {
  assert.match(manage, /seller_booking_eligible_resources/);
  assert.match(manage, /eligibleResources\.map/);
  assert.match(manage, /eligibleResourcesLoading/);
  assert.doesNotMatch(manage, /Pracownik \/ zasób[\s\S]{0,800}resources\.map/);
});

test('eligible resource RPC enforces seller access and service-resource mapping', () => {
  assert.match(migration, /v_booking\.seller_id=market\.current_seller_id\(\) or market\.is_operator\(\)/);
  assert.match(migration, /booking_offer_resources/);
  assert.match(migration, /booking_service_resources/);
  assert.match(migration, /revoke execute on function market\.seller_booking_eligible_resources\(uuid\) from anon/i);
  assert.match(migration, /grant execute on function market\.seller_booking_eligible_resources\(uuid\) to authenticated/i);
});
