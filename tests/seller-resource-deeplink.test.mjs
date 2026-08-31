import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerResourceSchedules.tsx', import.meta.url), 'utf8');

test('resource schedules support stable resource deep links without regressing management RPCs', () => {
  assert.match(page, /useSearchParams/);
  assert.match(page, /sp\.get\("resource"\)/);
  assert.match(page, /next\.set\("resource",id\)/);
  assert.match(page, /seller_booking_resources_manage/);
  assert.match(page, /seller_booking_resource_update/);
  assert.doesNotMatch(page, /seller_booking_resource_upsert/);
});
