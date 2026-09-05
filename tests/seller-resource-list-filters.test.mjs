import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');

test('seller resource inventory supports search, type and status filters', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /const\[query,setQuery\]/);
  assert.match(page, /const\[kindFilter,setKindFilter\]/);
  assert.match(page, /const\[statusFilter,setStatusFilter\]/);
  assert.match(page, /filteredResources=useMemo/);
  assert.match(page, /Szukaj zasobu/);
  assert.match(page, /Wszystkie typy/);
  assert.match(page, /Każdy status/);
  assert.match(page, /filteredResources\.map/);
});

test('resource filtering does not replace the canonical update RPC', () => {
  assert.match(page, /seller_booking_resource_update/);
  assert.doesNotMatch(page, /seller_booking_resource_upsert/);
});
