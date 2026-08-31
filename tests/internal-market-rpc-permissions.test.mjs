import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_harden_internal_market_rpc_permissions.sql', import.meta.url), 'utf8');

test('verification automation RPCs are service-role only', () => {
  for (const signature of [
    'market.mark_verification_processing(uuid,jsonb)',
    'market.finish_verification_automation(uuid,jsonb,jsonb)',
    'market.fail_verification_automation(uuid,text,jsonb)',
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[()]/g, '\\$&')} from anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function ${signature.replace(/[()]/g, '\\$&')} to service_role`, 'i'));
  }
});

test('trigger and internal helpers are not client-callable', () => {
  assert.match(migration, /revoke execute on function market\._auto_forward_on\(\) from anon, authenticated/i);
  assert.match(migration, /revoke execute on function market\.trg_order_paid_fulfillment\(\) from anon, authenticated/i);
});

test('operator verification RPCs require authentication and keep function-level operator guard', () => {
  assert.match(migration, /revoke execute on function market\.operator_complete_verification\(uuid,jsonb,text,text\) from anon/i);
  assert.match(migration, /grant execute on function market\.operator_complete_verification\(uuid,jsonb,text,text\) to authenticated/i);
  assert.match(migration, /revoke execute on function market\.operator_verification_requests\(\) from anon/i);
  assert.match(migration, /grant execute on function market\.operator_verification_requests\(\) to authenticated/i);
});
