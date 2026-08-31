import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerOffersManage.tsx', import.meta.url), 'utf8');

test('seller offer editor links to the canonical booking settings screen', () => {
  assert.match(page, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{edit\.offer_id\}/);
  assert.match(page, /Ustaw booking/);
  assert.match(page, /Grafiki pracowników i zasobów/);
});

test('seller offer editor no longer mutates booking configuration inline', () => {
  assert.doesNotMatch(page, /bookingPublicConfig/);
  assert.doesNotMatch(page, /configureBookingOffer/);
  assert.doesNotMatch(page, /replaceBookingAvailability/);
  assert.doesNotMatch(page, /saveBooking/);
  assert.doesNotMatch(page, /bookingSaving/);
  assert.doesNotMatch(page, /Dostępność tygodniowa/);
});

test('offer essentials remain editable after booking editor retirement', () => {
  assert.match(page, /OfferPhotoManager/);
  assert.match(page, /Prowizje Ambassador Club/);
  assert.match(page, /Pełna faktura VAT/);
  assert.match(page, /updateOfferManage/);
});
