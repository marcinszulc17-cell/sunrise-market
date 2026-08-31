import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_drop_legacy_reschedule_mail_helper.sql', import.meta.url), 'utf8');

test('legacy reschedule mail helper is removed in favor of the canonical mail trigger path', () => {
  assert.match(migration, /drop function if exists market\.enqueue_booking_rescheduled_emails\(uuid,text\)/i);
  assert.match(migration, /canonical enqueue_booking_emails/i);
});
