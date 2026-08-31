import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_restore_canonical_booking_mail_pipeline.sql', import.meta.url), 'utf8');

test('drift repair removes the divergent reschedule mail pipeline', () => {
  assert.match(migration, /drop trigger if exists booking_reschedule_mail_trigger/i);
  assert.match(migration, /drop function if exists market\.booking_reschedule_mail_trigger\(\)/i);
  assert.match(migration, /drop function if exists market\.enqueue_booking_rescheduled_emails\(uuid,text\)/i);
});

test('canonical trigger owns created status and rescheduled booking emails', () => {
  assert.match(migration, /create or replace function market\.booking_mail_trigger\(\)/i);
  assert.match(migration, /enqueue_booking_emails\(new\.id,'rescheduled'\)/i);
  assert.match(migration, /after insert or update of status,starts_at,ends_at,resource_id/i);
});

test('canonical outbox idempotency and permissions are restored', () => {
  assert.match(migration, /unique \(booking_id,event_key,recipient_type\)/i);
  assert.match(migration, /'resource_name',v_resource_name/);
  assert.match(migration, /'timezone',coalesce\(v_timezone,'Europe\/Warsaw'\)/);
  assert.match(migration, /revoke execute on function market\.enqueue_booking_emails\(uuid,text\) from anon,authenticated/i);
  assert.match(migration, /grant execute on function market\.enqueue_booking_emails\(uuid,text\) to service_role/i);
});
