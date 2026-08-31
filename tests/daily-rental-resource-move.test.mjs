import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const move = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_daily_booking_move_resource.sql', import.meta.url), 'utf8');
const availability = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_daily_booking_resources_at.sql', import.meta.url), 'utf8');

test('daily rental move preserves booking length and serializes fleet allocation', () => {
  assert.match(move, /booking_type<>'daily'/);
  assert.match(move, /make_interval\(days=>v_booking\.units\)/);
  assert.match(move, /hashtextextended\(v_booking\.offer_id::text\|\|':daily'/);
  assert.match(move, /x\.id<>v_booking\.id/);
  assert.match(move, /booking_resource_time_off/);
  assert.match(move, /set starts_at=v_start,ends_at=v_end,resource_id=p_resource,updated_at=now\(\)/);
  assert.doesNotMatch(move, /amount_gross\s*=/);
});

test('target-date resource availability is calculated for the requested new period', () => {
  assert.match(availability, /seller_booking_daily_resources_at/);
  assert.match(availability, /p_starts_at timestamptz/);
  assert.match(availability, /make_interval\(days=>v_booking\.units\)/);
  assert.match(availability, /x\.id<>v_booking\.id/);
  assert.match(availability, /booking_resource_time_off/);
});

test('daily rental move RPCs are authenticated-only', () => {
  for (const source of [move, availability]) {
    assert.match(source, /revoke all on function market\./);
    assert.match(source, /from public/);
    assert.match(source, /from anon/);
    assert.match(source, /to authenticated/);
  }
});
