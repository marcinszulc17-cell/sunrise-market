import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');

test('booking modal uses shared market cashback configuration', () => {
  assert.match(modal, /getMarketConfig/);
  // Cashback liczy sie od podstawy bez oplaty miejscowej, nie od calej kwoty do zaplaty.
  assert.match(modal, /cashbackFor\(cashbackBase, cashbackRate\)/);
  assert.match(modal, /const cashbackBase = .*Math\.max\(0, total - cityTax\)/);
  assert.match(modal, /setCashbackRate\(c\.cashbackRate\)/);
  assert.doesNotMatch(modal, /total \* 0\.03/);
});
