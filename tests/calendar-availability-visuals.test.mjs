import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const calendar = fs.readFileSync(new URL('../src/components/SellerBookingCalendar.tsx', import.meta.url), 'utf8');

test('calendar uses 30 half-hour intervals between 07:00 and 22:00', () => {
  assert.match(calendar, /SLOT_COUNT=\(END_MIN-START_MIN\)\/30/);
  assert.doesNotMatch(calendar, /length:31/);
});

test('daily rentals remain visible above day and week timelines', () => {
  assert.match(calendar, /DailyStrip/);
  assert.match(calendar, /WYNAJMY DOBOWE/);
});

test('resource time off is loaded in one bulk call and rendered in resource columns', () => {
  assert.match(calendar, /seller_booking_resources_schedule_bulk/);
  assert.doesNotMatch(calendar, /resources\.map\(async/);
  assert.match(calendar, /resourceTimeOff/);
  assert.match(calendar, /Niedostępny/);
});

test('overlapping appointment events are assigned visual lanes', () => {
  assert.match(calendar, /layoutTimedEvents/);
  assert.match(calendar, /laneCount/);
  assert.match(calendar, /width=`calc\(\$\{width\}% - 6px\)`/);
});
