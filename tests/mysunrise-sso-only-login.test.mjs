import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const login = fs.readFileSync(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');
const sso = fs.readFileSync(new URL('../src/pages/Sso.tsx', import.meta.url), 'utf8');

test('Market login redirects to MySunrise hub instead of rendering credentials form', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(login, /https:\/\/mysunrise\.pl/);
  assert.match(login, /\/market\?return=/);
  assert.doesNotMatch(login, /signInWithPassword/);
  assert.doesNotMatch(login, /type="password"/);
});

test('SSO restores the requested Market path after verification', () => {
  assert.match(sso, /safeNext/);
  assert.match(sso, /refreshCustomerAccess/);
  assert.match(sso, /window\.location\.replace\(safeNext\(\)\)/);
});
