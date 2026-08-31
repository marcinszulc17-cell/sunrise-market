import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/components/SellerBookingOpsSidebar.tsx', import.meta.url), 'utf8');

test('active resources link to concrete resource management', () => {
  assert.match(source, /grafiki\?resource=/);
  assert.match(source, /encodeURIComponent\(resource\.id\)/);
  assert.match(source, /Edytuj →/);
});
