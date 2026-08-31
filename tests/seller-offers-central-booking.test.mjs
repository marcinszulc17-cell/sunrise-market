import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerOffersManage.tsx', import.meta.url), 'utf8');

test('seller offer editor delegates booking to the canonical setup page', () => {
  assert.doesNotMatch(page, /bookingPublicConfig/);
  assert.doesNotMatch(page, /configureBookingOffer/);
  assert.doesNotMatch(page, /replaceBookingAvailability/);
  assert.doesNotMatch(page, /Zapisz booking/);
  assert.match(page, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{edit\.offer_id\}/);
  assert.match(page, /Ustaw booking/);
  assert.match(page, /Grafiki pracowników i zasobów/);
});
