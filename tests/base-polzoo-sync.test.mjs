import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../supabase/functions/base-polzoo-sync/index.ts', import.meta.url), 'utf8');

test('Base token stays server-side and is sent in the supported header', () => {
  assert.match(source, /Deno\.env\.get\("BASE_API_TOKEN"\)/);
  assert.match(source, /"X-BLToken": BASE_TOKEN/);
  assert.doesNotMatch(source, /console\.log\([^)]*BASE_TOKEN/);
});

test('new PolZoo products remain drafts unless activation is explicit', () => {
  assert.match(source, /const activate = body\.activate === true/);
  assert.match(source, /activate \? \(stock > 0 \? "active" : "sold_out"\) : "draft"/);
  assert.match(source, /Aktywacja wymaga dodatniej marży/);
});

test('catalog writes are idempotent through the Base product map', () => {
  assert.match(source, /base_polzoo_product_map/);
  assert.match(source, /onConflict: "inventory_id,base_product_id"/);
});

test('Base calls stay below the documented request-rate ceiling', () => {
  assert.match(source, /650 - \(Date\.now\(\) - lastBaseCallAt\)/);
});

test('array product lists use product ids instead of array indexes', () => {
  assert.match(source, /Array\.isArray\(products\)/);
  assert.match(source, /p\.id \?\? p\.product_id/);
});
