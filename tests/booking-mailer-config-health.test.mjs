import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('booking mailer fails loudly when Resend is not configured', () => {
  assert.match(mailer, /if \(!resend\) return json\(\{ ok: false, configured: false, message: "RESEND_API_KEY missing" \}, 503\)/);
  assert.doesNotMatch(mailer, /RESEND_API_KEY missing" \}\);/);
});

test('configured booking mailer still reports healthy success', () => {
  assert.match(mailer, /ok: true, configured: true/);
  assert.match(mailer, /https:\/\/api\.resend\.com\/emails/);
});
