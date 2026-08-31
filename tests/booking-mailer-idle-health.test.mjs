import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('mailer reads pending work before deciding whether provider is required', () => {
  const queueAt = mailer.indexOf('booking_mail_outbox');
  const providerAt = mailer.indexOf('if (!resend) return json');
  assert.ok(queueAt >= 0);
  assert.ok(providerAt > queueAt);
});

test('empty queue is a healthy idle cron tick', () => {
  assert.match(mailer, /if \(!rows\?\.length\) return json\(\{ ok: true, configured: Boolean\(resend\), processed: 0, sent: 0, failed: 0 \}\)/);
});

test('missing provider fails only when mail is actually pending', () => {
  assert.match(mailer, /pending: rows\.length/);
  assert.match(mailer, /RESEND_API_KEY missing/);
  assert.match(mailer, /\}, 503\)/);
});
