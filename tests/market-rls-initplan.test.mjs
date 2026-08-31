import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_optimize_market_auth_rls_initplan.sql', import.meta.url), 'utf8');

test('Market owner RLS policies evaluate auth uid through a select initplan', () => {
  for (const policy of [
    'notifications_owner',
    'smart_self_read',
    'wallet_mirror_owner_read',
    'wallet_ops_owner_read',
    'wallet_topups_owner_read',
    'web_push_own_select',
    'web_push_own_insert',
    'web_push_own_update',
    'web_push_own_delete',
  ]) assert.match(migration, new RegExp(`alter policy ${policy}`));

  assert.match(migration, /\(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /user_id = auth\.uid\(\)/);
});

test('seller payout policy preserves email matching but evaluates JWT once', () => {
  assert.match(migration, /alter policy payout_runs_seller_read/);
  assert.match(migration, /\(\(select auth\.jwt\(\)\) ->> 'email'/);
});
