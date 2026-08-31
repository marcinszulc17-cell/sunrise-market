import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_rescheduled_email_events.sql', import.meta.url), 'utf8');
const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('confirmed booking time or resource changes enqueue rescheduled email events', () => {
  assert.match(migration, /update of status,starts_at,ends_at,resource_id/i);
  assert.match(migration, /new\.status='confirmed'/);
  assert.match(migration, /old\.status='confirmed'/);
  assert.match(migration, /new\.starts_at is distinct from old\.starts_at/);
  assert.match(migration, /new\.ends_at is distinct from old\.ends_at/);
  assert.match(migration, /new\.resource_id is distinct from old\.resource_id/);
  assert.match(migration, /enqueue_booking_emails\(new\.id,'rescheduled'\)/);
});

test('rescheduled email event is allowed and repeatable through event_key', () => {
  assert.match(migration, /booking_mail_outbox_event_type_check/);
  assert.match(migration, /'rescheduled'/);
  assert.match(migration, /event_key text/);
  assert.match(migration, /p_event='rescheduled'/);
  assert.match(migration, /b\.updated_at::text/);
  assert.match(migration, /unique \(booking_id, event_key, recipient_type\)/i);
  assert.match(migration, /'resource_name',v_resource_name/);
});

test('migration replays safely after the temporary PR 82 event-key model', () => {
  assert.match(migration, /where event_key is null or event_key='default'/i);
  assert.match(migration, /drop constraint if exists booking_mail_outbox_booking_event_recipient_event_key_key/i);
  assert.match(migration, /alter column event_key drop default/i);
});

test('booking mail helpers stay internal and use one canonical trigger', () => {
  assert.match(migration, /revoke all on function market\.enqueue_booking_emails\(uuid,text\) from public/);
  assert.match(migration, /revoke execute on function market\.enqueue_booking_emails\(uuid,text\) from anon,authenticated/);
  assert.match(migration, /revoke all on function market\.booking_mail_trigger\(\) from public/);
  assert.match(migration, /create trigger trg_booking_mail_events/i);
  assert.doesNotMatch(migration, /create trigger booking_reschedule_mail_trigger/i);
});

test('booking mailer has a dedicated rescheduled template', () => {
  assert.match(mailer, /rescheduled:/);
  assert.match(mailer, /Nowy termin Twojej rezerwacji/);
  assert.match(mailer, /Termin rezerwacji został zmieniony/);
  assert.match(mailer, /Termin lub przypisany zasób rezerwacji został zmieniony/);
});
