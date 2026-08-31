import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_eligible_resources.sql', import.meta.url), 'utf8');

test('mobile move selector loads only eligible resources for the booking', () => {
  assert.match(page, /seller_booking_eligible_resources/);
  assert.match(page, /eligibleMoveResources\.map/);
  assert.doesNotMatch(page, /resources\.map\(\(resource\) => <option/);
  assert.match(page, /Lista pokazuje tylko zasoby przypisane do tej oferty i usługi/);
});

test('eligible resource RPC enforces offer and service mappings', () => {
  assert.match(migration, /booking_offer_resources/);
  assert.match(migration, /booking_service_resources/);
  assert.match(migration, /r\.seller_id=v_booking\.seller_id/);
  assert.match(migration, /revoke all on function market\.seller_booking_eligible_resources\(uuid\) from public/);
  assert.match(migration, /grant execute on function market\.seller_booking_eligible_resources\(uuid\) to authenticated/);
});
