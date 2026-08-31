import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831235959_final_financial_snapshot_guard.sql', import.meta.url), 'utf8');

test('cart and booking checkout freeze VAT and Ambassador eligibility on order items', () => {
  assert.match(migration, /commission_model_snapshot text not null default 'cashback_only'/);
  assert.match(migration, /ambassador_eligible boolean not null default false/);
  const snapshots = migration.match(/commission_model_snapshot,ambassador_eligible/g) || [];
  assert.ok(snapshots.length >= 2);
  assert.match(migration, /v_vat:=market\.offer_vat_rate\(v_offer\.attributes\)/);
});

test('Ambassador settlement uses immutable eligibility and discounted gross/net basis', () => {
  assert.match(migration, /oi\.ambassador_eligible=true/);
  assert.match(migration, /v_order\.discount_amount/);
  assert.match(migration, /1-v_discount_ratio/);
  assert.match(migration, /oi\.commission_model_snapshot/);
  assert.doesNotMatch(migration, /join market\.offers o on o\.id=oi\.offer_id/);
});

test('historical VAT is never backfilled from later offer edits', () => {
  assert.match(migration, /drop trigger if exists trg_offer_vat_backfill_pending/);
  assert.match(migration, /drop function if exists market\.trg_offer_vat_backfill_pending/);
});

test('financial checkout functions remain server-only', () => {
  assert.match(migration, /revoke execute on function market\.checkout\(uuid,jsonb\) from anon,authenticated/);
  assert.match(migration, /revoke execute on function market\.checkout_booking\(uuid,uuid\) from anon,authenticated/);
  assert.match(migration, /grant execute on function market\.checkout_booking\(uuid,uuid\) to service_role/);
});
