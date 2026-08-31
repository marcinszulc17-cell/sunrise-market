import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const mailer = fs.readFileSync(new URL('../supabase/functions/booking-mailer/index.ts', import.meta.url), 'utf8');

test('booking mailer formats dates in the booking timezone with a safe fallback', () => {
  assert.match(mailer, /safeTimezone\(p\.timezone\)/);
  assert.match(mailer, /timeZone: timezone/);
  assert.match(mailer, /return "Europe\/Warsaw"/);
  assert.doesNotMatch(mailer, /const fmt = \(iso: string, withTime = true\).*timeZone: "Europe\/Warsaw"/);
});

test('booking mailer includes the assigned resource when present', () => {
  assert.match(mailer, /p\.resource_name/);
  assert.match(mailer, /Pracownik \/ zasób/);
});
