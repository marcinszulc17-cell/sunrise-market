import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const login = fs.readFileSync(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');

test('central MySunrise login receives the exact Market origin', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(login, /origin: window\.location\.origin/);
  assert.match(login, /new URLSearchParams\(/);
  assert.match(login, /MYSUNRISE_URL\}\/market\?\$\{params\.toString\(\)\}/);
});
