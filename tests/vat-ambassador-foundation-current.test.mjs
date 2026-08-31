import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/migrations/20260831_vat_ambassador_foundation_current.sql', import.meta.url), 'utf8');

test('both product and booking checkout snapshot gross VAT and net', () => {
  assert.match(sql, /add column if not exists line_gross numeric/);
  assert.match(sql, /add column if not exists vat_rate numeric/);
  assert.match(sql, /add column if not exists amount_net numeric/);
  assert.match(sql, /create or replace function market\.checkout\(/);
  assert.match(sql, /create or replace function market\.checkout_booking\(/);
  const snapshots = sql.match(/line_gross,vat_rate,amount_net/g) || [];
  assert.ok(snapshots.length >= 2, 'product and booking checkout should both write VAT snapshots');
});

test('Ambassador outbox uses discounted net basis and does not dispatch anything', () => {
  assert.match(sql, /ambassador_commission_outbox/);
  assert.match(sql, /discount_ratio/);
  assert.match(sql, /eligible_net/);
  assert.match(sql, /commission_model,'cashback_only'\)='mlm_full'/);
  assert.doesNotMatch(sql, /fetch\(/);
  assert.doesNotMatch(sql, /http_post/i);
  assert.doesNotMatch(sql, /net\.http/i);
});

test('historical VAT snapshots are not rewritten from later offer edits', () => {
  assert.doesNotMatch(sql, /trg_offer_vat_backfill_pending/);
  assert.doesNotMatch(sql, /after update of attributes on market\.offers/i);
});

test('financial RPCs remain server-side only', () => {
  for (const signature of [
    'market.checkout\\(uuid,jsonb\\)',
    'market.checkout_booking\\(uuid,uuid\\)',
    'market.offer_vat_rate\\(jsonb\\)',
    'market.enqueue_ambassador_commission\\(uuid\\)',
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function ${signature} from anon,authenticated`));
  }
  assert.match(sql, /grant execute on function market\.checkout_booking\(uuid,uuid\) to service_role/);
});
