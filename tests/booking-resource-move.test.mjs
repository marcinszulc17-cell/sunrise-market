import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar = fs.readFileSync('src/components/SellerBookingCalendar.tsx','utf8');
const manage = fs.readFileSync('src/pages/SellerBookingsManage.tsx','utf8');
const moveMigration = fs.readFileSync('supabase/migrations/20260831_booking_multi_resource_move.sql','utf8');
const rescheduleMigration = fs.readFileSync('supabase/migrations/20260831_booking_multi_resource_reschedule.sql','utf8');

test('resource view sends exact slot and target resource', () => {
  assert.match(calendar, /onResourceTimeDrop/);
  assert.match(calendar, /dropBookingOnResource/);
  assert.match(calendar, /resourceId/);
  assert.match(calendar, /Tylko podgląd/);
  assert.match(manage, /seller_booking_move/);
  assert.match(manage, /p_resource/);
});

test('backend preserves multi-resource concurrency', () => {
  assert.match(moveMigration, /seller_booking_move/);
  assert.match(moveMigration, /x\.resource_id=p_resource/);
  assert.match(moveMigration, /x\.resource_id is null/);
  assert.match(moveMigration, /booking_service_resources/);
  assert.match(rescheduleMigration, /v_booking\.resource_id is not null/);
  assert.match(rescheduleMigration, /x\.resource_id=v_booking\.resource_id/);
});

test('resource move does not rewrite paid commercial fields', () => {
  const moveBody = moveMigration.slice(moveMigration.indexOf('create or replace function market.seller_booking_move'));
  assert.match(moveBody, /set starts_at=v_start,ends_at=v_end,resource_id=p_resource,updated_at=now\(\)/);
  assert.doesNotMatch(moveBody, /set amount_gross=/);
  assert.doesNotMatch(moveBody, /set paid_at=/);
  assert.doesNotMatch(moveBody, /set order_id=/);
});
