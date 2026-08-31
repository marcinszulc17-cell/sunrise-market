import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_harden_booking_rpc_execute_permissions.sql', import.meta.url), 'utf8');

const sellerOnly = [
  'seller_booking_catalog_v2',
  'seller_booking_rate_delete',
  'seller_booking_rate_upsert',
  'seller_booking_resource_unlink',
  'seller_booking_resource_upsert',
  'seller_booking_save_extras',
  'seller_booking_service_delete',
  'seller_booking_service_upsert',
];

test('seller booking configuration RPCs are not executable anonymously', () => {
  for (const name of sellerOnly) {
    assert.match(migration, new RegExp(`revoke execute on function market\\.${name}`));
  }
  assert.match(migration, /revoke execute on function market\.create_booking_hold_v2/);
});

test('authenticated users keep required booking access', () => {
  for (const name of sellerOnly) {
    assert.match(migration, new RegExp(`grant execute on function market\\.${name}`));
  }
  assert.match(migration, /grant execute on function market\.create_booking_hold_v2/);
});
