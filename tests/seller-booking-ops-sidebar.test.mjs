import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/SellerBookingOpsSidebar.tsx', import.meta.url), 'utf8');

test('seller booking page keeps change history while delegating operations sidebar', () => {
  assert.match(page, /BookingChangeHistory/);
  assert.match(page, /<BookingChangeHistory bookingId=\{r\.id\}/);
  assert.match(page, /SellerBookingOpsSidebar/);
});

test('booking block editor validates end after start before RPC', () => {
  assert.match(page, /to\.getTime\(\) <= from\.getTime\(\)/);
  assert.match(page, /Koniec blokady musi być później niż jej początek/);
  assert.match(page, /p_starts_at: from\.toISOString\(\)/);
  assert.match(page, /p_ends_at: to\.toISOString\(\)/);
});

test('operations sidebar exposes block management, selected offer settings and notification policy', () => {
  assert.match(sidebar, /Aktywne blokady/);
  assert.match(sidebar, /onDeleteBlock\(block\.id\)/);
  assert.match(sidebar, /selectedOffer/);
  assert.match(sidebar, /Ustaw booking dla/);
  assert.match(sidebar, /Powiadomienia klienta/);
  assert.match(sidebar, /aplikacja\/push \+ e-mail/);
  assert.match(sidebar, /Szybkie ustawienia/);
});
