import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_push_notification_queue_user_index.sql', import.meta.url), 'utf8');

test('push notification queue has a covering user foreign-key index', () => {
  assert.match(migration, /create index if not exists push_notification_queue_user_idx/i);
  assert.match(migration, /market\.push_notification_queue\(user_id\)/i);
});
