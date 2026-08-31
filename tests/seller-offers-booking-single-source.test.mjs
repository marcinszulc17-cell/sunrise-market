import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/pages/SellerOffersManage.tsx', import.meta.url), 'utf8');

test('seller offers routes booking setup to the dedicated booking screen', () => {
  assert.match(source, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{edit\.offer_id\}/);
  assert.match(source, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{r\.offer_id\}/);
  assert.match(source, /Ustaw booking/);
});

test('seller offers no longer owns a duplicate booking configuration editor', () => {
  assert.doesNotMatch(source, /configureBookingOffer/);
  assert.doesNotMatch(source, /replaceBookingAvailability/);
  assert.doesNotMatch(source, /bookingPublicConfig/);
  assert.doesNotMatch(source, /bookingType/);
  assert.doesNotMatch(source, /bookingSaving/);
  assert.doesNotMatch(source, /Dostępność tygodniowa/);
  assert.doesNotMatch(source, /Zapisz booking/);
});
