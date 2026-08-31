import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const dedicated = fs.readFileSync(new URL('../src/pages/DedicatedOfferWizard.tsx', import.meta.url), 'utf8');
const product = fs.readFileSync(new URL('../src/pages/SprzedawcaV2.tsx', import.meta.url), 'utf8');
const manage = fs.readFileSync(new URL('../src/pages/SellerOffersManage.tsx', import.meta.url), 'utf8');

for (const [name, source] of [['dedicated', dedicated], ['product', product]]) {
  test(`${name} seller wizard requires a supported VAT rate`, () => {
    assert.match(source, /VAT_RATES = \["23", "8", "5", "0"\]/);
    assert.match(source, /Wybierz stawkę VAT: 23%, 8%, 5% lub 0%/);
    assert.match(source, /vat_rate: Number\(vatRate\)/);
    assert.match(source, /Stawka VAT \*/);
  });
}

test('seller offer editor does not guess VAT for legacy offers', () => {
  assert.match(manage, /VAT_RATES = \["23", "8", "5", "0"\]/);
  assert.match(manage, /rawVat/);
  assert.match(manage, /vat_rate: Number\(edit\.vat_rate\)/);
  assert.match(manage, /Ta starsza oferta nie ma zapisanej stawki VAT/);
  assert.doesNotMatch(manage, /vat_rate:\s*23/);
});
