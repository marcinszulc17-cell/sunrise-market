import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../src/components/BuyerOfferActions.tsx', import.meta.url), 'utf8');

test('booking CTA waits for and requires public booking config', () => {
  assert.match(src, /bookingChecked/);
  assert.match(src, /bookingReady/);
  assert.match(src, /Kalendarz niedostępny/);
  assert.match(src, /disabled=\{busy\|\|\(isBooking&&\(!bookingChecked\|\|!bookingReady\)\)\}/);
});

test('external booking open event cannot open inactive calendar', () => {
  assert.match(src, /if\(!bookingChecked\)/);
  assert.match(src, /if\(bookingConfig\) setBookingOpen\(true\)/);
  assert.match(src, /musi dokończyć konfigurację rezerwacji/);
});
