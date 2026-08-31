import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_reschedule_price_preview.sql', import.meta.url), 'utf8');

test('seller sees a reference price without repricing the booking', () => {
  assert.match(page, /seller_booking_reschedule_price_preview/);
  assert.match(page, /Cena rezerwacji pozostaje zablokowana/);
  assert.match(page, /Aktualna cena wg cennika dla nowego terminu/);
  assert.match(page, /nie pobierze dopłaty i nie wykona zwrotu automatycznie/);
  assert.match(page, /difference_gross/);
});

test('preview RPC uses current daily seasonal pricing but is read-only', () => {
  assert.match(migration, /booking_price_for_day\(v_booking\.offer_id,v_day\)/);
  assert.match(migration, /cleaning_fee_gross/);
  assert.match(migration, /deposit_gross/);
  assert.match(migration, /'locked_at_booking'::text/);
  assert.doesNotMatch(migration, /update market\.bookings/i);
  assert.doesNotMatch(migration, /insert into market\.orders/i);
});

test('price preview is seller-only authenticated RPC', () => {
  assert.match(migration, /Brak dostępu/);
  assert.match(migration, /current_seller_id\(\)/);
  assert.match(migration, /revoke all on function market\.seller_booking_reschedule_price_preview\(uuid,timestamptz\) from public/);
  assert.match(migration, /revoke execute on function market\.seller_booking_reschedule_price_preview\(uuid,timestamptz\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_reschedule_price_preview\(uuid,timestamptz\) to authenticated/);
});
