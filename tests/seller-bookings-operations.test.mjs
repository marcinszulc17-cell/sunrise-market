import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');

test('seller booking operations panel exposes active blocks and deletion', () => {
  assert.match(page, /const activeBlocks = useMemo/);
  assert.match(page, /Aktywne blokady/);
  assert.match(page, /activeBlocks\.map/);
  assert.match(page, /deleteBlock\(block\.id\)/);
  assert.match(page, /Termin znów może być dostępny dla klientów/);
});

test('block editor validates the interval and links to selected offer settings', () => {
  assert.match(page, /to\.getTime\(\) <= from\.getTime\(\)/);
  assert.match(page, /Koniec blokady musi być później niż jej początek/);
  assert.match(page, /selectedOffer/);
  assert.match(page, /\/sprzedawca\/rezerwacje\/ustawienia\/\$\{selectedOffer\.offer_id\}/);
});

test('seller sees automatic booking notification policy', () => {
  assert.match(page, /Powiadomienia automatyczne/);
  assert.match(page, /aplikacji\/push oraz e-mail/);
  assert.match(page, /nie zmienia automatycznie ceny opłaconej rezerwacji/);
});
