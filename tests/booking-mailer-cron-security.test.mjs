import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_secure_booking_mailer_cron.sql', import.meta.url), 'utf8');

test('booking mailer cron authenticates from Vault without committed credentials', () => {
  assert.match(migration, /booking_mailer_cron_jwt/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /'Authorization','Bearer '/);
  assert.match(migration, /'apikey'/);
  assert.match(migration, /cron\.schedule/);
  assert.match(migration, /'booking-mailer'/);
  assert.doesNotMatch(migration, /eyJ[a-zA-Z0-9_-]+\./);
  assert.doesNotMatch(migration, /service_role/i);
});
