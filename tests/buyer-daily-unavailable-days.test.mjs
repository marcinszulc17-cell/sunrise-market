import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');
const calendar = fs.readFileSync(new URL('../src/components/DailyRangeCalendar.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/lib/bookingV2.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_booking_daily_unavailable_days.sql', import.meta.url), 'utf8');

test('daily buyer modal loads occupied dates before showing the calendar', () => {
  assert.match(api, /bookingUnavailableDaysV2/);
  assert.match(api, /booking_unavailable_days_v2/);
  assert.match(modal, /bookingUnavailableDaysV2/);
  assert.match(modal, /unavailableDates=\{unavailableDays\}/);
  assert.match(modal, /Sprawdzam zajęte i zablokowane dni/);
});

test('range calendar blocks occupied starts and ranges crossing occupied nights', () => {
  assert.match(calendar, /rangeHitsUnavailable/);
  assert.match(calendar, /unavailable\.has\(value\)/);
  assert.match(calendar, /crossesOccupiedNight/);
  assert.match(calendar, /możliwy dzień zwrotu/);
});

test('public unavailable-day RPC mirrors daily hold conflict semantics without leaking booking details', () => {
  assert.match(migration, /returns table\(day date, reason text\)/i);
  assert.match(migration, /x\.status='confirmed'/);
  assert.match(migration, /x\.status in \('held','pending_payment'\) and x\.hold_expires_at>now\(\)/);
  assert.match(migration, /market\.booking_blocks/);
  assert.match(migration, /grant execute on function market\.booking_unavailable_days_v2\(uuid,date,date\) to anon, authenticated/);
  assert.doesNotMatch(migration, /buyer_id|recipient_email|buyer_email/);
});
