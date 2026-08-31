import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');

test('booking modal uses shared market cashback configuration', () => {
  assert.match(modal, /getMarketConfig/);
  assert.match(modal, /cashbackFor\(total, cashbackRate\)/);
  assert.match(modal, /setCashbackRate\(c\.cashbackRate\)/);
  assert.doesNotMatch(modal, /total \* 0\.03/);
});
