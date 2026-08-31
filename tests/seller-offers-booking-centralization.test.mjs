import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerOffersManage.tsx', import.meta.url), 'utf8');

test('seller offers editor delegates booking configuration to the central setup page', () => {
  assert.match(page, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{edit\.offer_id\}/);
  assert.match(page, /CENTRALNE USTAWIENIA/);
  assert.doesNotMatch(page, /configureBookingOffer/);
  assert.doesNotMatch(page, /replaceBookingAvailability/);
  assert.doesNotMatch(page, /bookingPublicConfig/);
  assert.doesNotMatch(page, /BookingWindow/);
  assert.doesNotMatch(page, /Zapisz booking/);
});

test('offer editing remains available alongside centralized booking links', () => {
  assert.match(page, /updateOfferManage/);
  assert.match(page, /OfferPhotoManager/);
  assert.match(page, /Prowizje Ambassador Club/);
  assert.match(page, /Pełna faktura VAT/);
  assert.match(page, /\/sprzedawca\/rezerwacje\/grafiki/);
});
