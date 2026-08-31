import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_index_remaining_market_foreign_keys.sql', import.meta.url), 'utf8');

test('remaining Market foreign keys get covering indexes', () => {
  assert.match(migration, /ad_campaigns_offer_id_idx/);
  assert.match(migration, /market\.ad_campaigns\(offer_id\)/);
  assert.match(migration, /ad_campaigns_rate_code_idx/);
  assert.match(migration, /market\.ad_campaigns\(rate_code\)/);
  assert.match(migration, /promotion_purchases_offer_id_idx/);
  assert.match(migration, /market\.promotion_purchases\(offer_id\)/);
});
