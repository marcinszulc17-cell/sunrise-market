import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const headersFor = (source) => vercel.headers.find((row) => row.source === source)?.headers ?? [];
const robotsFor = (source) => headersFor(source).find((header) => header.key === 'X-Robots-Tag')?.value;

test('private and transactional routes receive server-side noindex headers', () => {
  for (const source of ['/sprzedawca', '/sprzedawca/(.*)', '/operator', '/operator/(.*)', '/login', '/sso', '/konto', '/portfel', '/koszyk', '/zamowienia', '/rezerwacje']) {
    assert.equal(robotsFor(source), 'noindex, nofollow');
  }
  assert.equal(robotsFor('/szukaj'), 'noindex, follow');
  assert.equal(robotsFor('/porownaj'), 'noindex, follow');
});

test('client metadata follows the current route instead of always pointing to home', () => {
  assert.match(main, /NOINDEX_PREFIXES/);
  assert.match(main, /noindex, nofollow/);
  assert.match(main, /canonicalUrl = `https:\/\/sunrisemarket\.pl\$\{cleanPath\}`/);
  assert.match(main, /ogUrl\.setAttribute\("content", canonicalUrl\)/);
  assert.doesNotMatch(main, /canonicalUrl = ['"]https:\/\/sunrisemarket\.pl\/['"]/);
});

test('public category and product paths are not server-noindexed', () => {
  const sources = vercel.headers.map((row) => row.source);
  assert.ok(!sources.includes('/produkt/(.*)'));
  assert.ok(!sources.includes('/motoryzacja'));
  assert.ok(!sources.includes('/nieruchomosci'));
  assert.ok(!sources.includes('/cennik'));
});
