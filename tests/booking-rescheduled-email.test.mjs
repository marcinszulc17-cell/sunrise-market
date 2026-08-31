import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_rescheduled_email_events.sql', import.meta.url), 'utf8');

test('booking mail trigger enqueues rescheduled events for time or resource moves', () => {
  assert.match(migration, /update of status, starts_at, ends_at, resource_id/i);
  assert.match(migration, /new\.status='confirmed'/);
  assert.match(migration, /new\.starts_at is distinct from old\.starts_at/);
  assert.match(migration, /new\.resource_id is distinct from old\.resource_id/);
  assert.match(migration, /enqueue_booking_emails\(new\.id,'rescheduled'\)/);
});

test('rescheduled emails keep clean event type but unique per booking update', () => {
  assert.match(migration, /event_key text/);
  assert.match(migration, /p_event='rescheduled'/);
  assert.match(migration, /b\.updated_at::text/);
  assert.match(migration, /unique \(booking_id, event_key, recipient_type\)/i);
  assert.match(migration, /'resource_name',v_resource_name/);
});

test('email enqueue helpers stay internal', () => {
  assert.match(migration, /revoke execute on function market\.enqueue_booking_emails\(uuid,text\) from anon, authenticated/);
  assert.match(migration, /revoke execute on function market\.booking_mail_trigger\(\) from anon, authenticated/);
});
