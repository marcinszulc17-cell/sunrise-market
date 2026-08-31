import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_change_audit.sql', import.meta.url), 'utf8');

test('confirmed booking moves are captured with locked commercial amounts', () => {
  assert.match(migration, /create table if not exists market\.booking_change_audit/);
  assert.match(migration, /new\.status='confirmed'/);
  assert.match(migration, /old\.status='confirmed'/);
  assert.match(migration, /old\.starts_at,old\.ends_at,new\.starts_at,new\.ends_at/);
  assert.match(migration, /locked_amount_gross/);
  assert.match(migration, /'locked_at_booking'/);
});

test('audit table remains RPC-only', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table market\.booking_change_audit from public,anon,authenticated/);
  assert.match(migration, /seller_booking_change_history/);
  assert.match(migration, /v_booking\.seller_id=market\.current_seller_id\(\) or market\.is_operator\(\)/);
  assert.match(migration, /revoke execute on function market\.seller_booking_change_history\(uuid\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_change_history\(uuid\) to authenticated/);
});

test('audit trigger distinguishes time, resource and combined changes', () => {
  assert.match(migration, /rescheduled_and_resource_changed/);
  assert.match(migration, /resource_changed/);
  assert.match(migration, /else 'rescheduled'/);
  assert.match(migration, /after update of starts_at,ends_at,resource_id on market\.bookings/);
});
