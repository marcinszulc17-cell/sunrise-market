import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_no_show_status.sql', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');

test('no-show is a terminal booking status guarded by seller/operator RPC', () => {
  assert.match(migration, /'no_show'/);
  assert.match(migration, /v\.booking_type<>'appointment'/);
  assert.match(migration, /v\.status<>'confirmed'/);
  assert.match(migration, /v\.starts_at>now\(\)/);
  assert.match(migration, /revoke execute on function market\.seller_booking_set_status\(uuid,text\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_set_status\(uuid,text\) to authenticated/);
});

test('seller UI exposes no-show only for started confirmed appointments', () => {
  assert.match(page, /no_show: "Nie pojawił się"/);
  assert.match(page, /\['no_show','Nieobecni'\]/);
  assert.match(page, /canMarkNoShow/);
  assert.match(page, /setStatus\(r\.id, "no_show"\)/);
  assert.match(page, /Nie pojawił się/);
});
