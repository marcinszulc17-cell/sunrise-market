import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_reminders_cron.sql', import.meta.url), 'utf8');

test('confirmed bookings enter the reminder window 24 hours before start', () => {
  assert.match(migration, /b\.status = 'confirmed'/);
  assert.match(migration, /b\.starts_at > now\(\)/);
  assert.match(migration, /b\.starts_at <= now\(\) \+ interval '24 hours'/);
  assert.match(migration, /enqueue_booking_emails\(r\.id, 'reminder'\)/);
});

test('booking reminder cron is replay-safe and runs every 15 minutes', () => {
  assert.match(migration, /jobname = 'booking-reminders'/);
  assert.match(migration, /cron\.unschedule\(v_job_id\)/);
  assert.match(migration, /'\*\/15 \* \* \* \*'/);
  assert.match(migration, /select market\.enqueue_booking_reminders\(\);/);
});

test('reminder enqueue function is not callable by browser roles', () => {
  assert.match(migration, /revoke execute on function market\.enqueue_booking_reminders\(\) from anon, authenticated/);
  assert.match(migration, /grant execute on function market\.enqueue_booking_reminders\(\) to service_role/);
});
