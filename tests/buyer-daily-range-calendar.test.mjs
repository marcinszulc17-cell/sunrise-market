import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');
const calendar = fs.readFileSync(new URL('../src/components/DailyRangeCalendar.tsx', import.meta.url), 'utf8');

test('daily booking uses the visual range calendar instead of native date inputs', () => {
  assert.match(modal, /DailyRangeCalendar/);
  assert.match(modal, /onChange=\{setRentalRange\}/);
  assert.doesNotMatch(modal, /type="date"/);
});

test('range calendar supports responsive two-month navigation and highlighted range', () => {
  assert.match(calendar, /md:grid-cols-2/);
  assert.match(calendar, /Następny miesiąc/);
  assert.match(calendar, /Poprzedni miesiąc/);
  assert.match(calendar, /inRange/);
  assert.match(calendar, /isFrom \|\| isTo/);
});

test('range selection respects configured min and max rental duration', () => {
  assert.match(calendar, /units < minUnits \|\| units > maxUnits/);
  assert.match(calendar, /addDays\(parseDay\(from\), maxUnits\)/);
  assert.match(calendar, /addDays\(parseDay\(from\), minUnits\)/);
});
