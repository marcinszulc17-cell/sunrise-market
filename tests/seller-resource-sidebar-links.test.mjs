import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sidebar = fs.readFileSync(new URL('../src/components/SellerBookingOpsSidebar.tsx', import.meta.url), 'utf8');

test('active resource cards open the matching resource schedule', () => {
  assert.match(sidebar, /rezerwacje\/grafiki\?resource=\$\{encodeURIComponent\(resource\.id\)\}/);
  assert.match(sidebar, /Edytuj →/);
  assert.match(sidebar, /resources\.map\(\(resource\) => <Link/);
});
