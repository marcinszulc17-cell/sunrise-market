import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_rescheduled_email_events.sql', import.meta.url), 'utf8');
const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('confirmed booking time or resource changes enqueue rescheduled email events', () => {
  assert.match(migration, /after update of starts_at,ends_at,resource_id/i);
  assert.match(migration, /new\.status='confirmed'/);
  assert.match(migration, /new\.starts_at is distinct from old\.starts_at/);
  assert.match(migration, /new\.ends_at is distinct from old\.ends_at/);
  assert.match(migration, /new\.resource_id is distinct from old\.resource_id/);
  assert.match(migration, /enqueue_booking_rescheduled_emails\(new\.id,v_event_key\)/);
});

test('rescheduled emails are repeatable but idempotent per concrete change', () => {
  assert.match(migration, /event_key text not null default 'default'/i);
  assert.match(migration, /unique \(booking_id, event_type, recipient_type, event_key\)/i);
  assert.match(migration, /'rescheduled'/);
  assert.match(migration, /booking_mail_outbox_event_type_check/);
});

test('reschedule enqueue helpers stay internal', () => {
  assert.match(migration, /revoke all on function market\.enqueue_booking_rescheduled_emails\(uuid,text\) from public/);
  assert.match(migration, /revoke execute on function market\.enqueue_booking_rescheduled_emails\(uuid,text\) from anon/);
  assert.match(migration, /revoke execute on function market\.enqueue_booking_rescheduled_emails\(uuid,text\) from authenticated/);
});

test('booking mailer has a dedicated rescheduled template', () => {
  assert.match(mailer, /rescheduled:/);
  assert.match(mailer, /Nowy termin Twojej rezerwacji/);
  assert.match(mailer, /Termin rezerwacji został zmieniony/);
});
