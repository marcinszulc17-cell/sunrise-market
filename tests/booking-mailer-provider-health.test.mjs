import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('booking mailer checks the queue before requiring a provider key', () => {
  const selectAt = mailer.indexOf('booking_mail_outbox');
  const missingProviderAt = mailer.indexOf('if (!resend) return json');
  assert.ok(selectAt >= 0);
  assert.ok(missingProviderAt > selectAt);
});

test('idle cron stays healthy even if Resend is not configured', () => {
  assert.match(mailer, /if \(!rows\?\.length\) return json\(\{ ok: true, configured: Boolean\(resend\), processed: 0, sent: 0, failed: 0 \}\)/);
});

test('pending mail without Resend becomes an explicit service error', () => {
  assert.match(mailer, /RESEND_API_KEY missing/);
  assert.match(mailer, /pending: rows\.length/);
  assert.match(mailer, /\}, 503\)/);
});

test('no mail provider credential is committed', () => {
  assert.doesNotMatch(mailer, /re_[A-Za-z0-9]{20,}/);
});
