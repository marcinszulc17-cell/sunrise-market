import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/migrations/20260831_fulfillment_status_rpc_validation.sql', import.meta.url), 'utf8');

test('seller fulfillment status RPC validates workflow states', () => {
  assert.match(sql, /p_status not in \('pending','processing','shipped','delivered','cancelled','error'\)/);
  assert.match(sql, /invalid fulfillment status/);
  assert.match(sql, /p_status is not null/);
});

test('seller fulfillment status RPC keeps owner and operator checks', () => {
  assert.match(sql, /market\.ami_operator\(\)/);
  assert.match(sql, /v_seller <> v_task\.seller_id/);
  assert.match(sql, /v_task\.lane <> 'seller'/);
});

test('seller fulfillment status RPC is authenticated-only with locked search path', () => {
  assert.match(sql, /set search_path to ''/);
  assert.match(sql, /revoke all on function public\.set_fulfillment_status\(uuid,text,text\) from public/);
  assert.match(sql, /revoke execute on function public\.set_fulfillment_status\(uuid,text,text\) from anon/);
  assert.match(sql, /grant execute on function public\.set_fulfillment_status\(uuid,text,text\) to authenticated/);
});
