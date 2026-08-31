import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../supabase/functions/teemdrop-bridge/index.ts', import.meta.url), 'utf8');

test('TeemDrop bridge checks queue before requiring Woo credentials', () => {
  const pending = source.indexOf("from('teemdrop_bridge_orders')");
  const idle = source.indexOf("if (!pending?.length)");
  const config = source.indexOf("if (!WOO || !CK || !CS)");
  assert.ok(pending >= 0);
  assert.ok(idle > pending);
  assert.ok(config > idle);
});

test('idle cron ticks return healthy 200 and expose configuration state', () => {
  assert.match(source, /processed: 0, results: \[\], configured: Boolean\(WOO && CK && CS\)/);
  assert.match(source, /status: 200/);
});

test('missing Woo configuration remains a hard failure when work is pending', () => {
  assert.match(source, /Brak konfiguracji WOO_\*/);
  assert.match(source, /pending: pending\.length/);
  assert.match(source, /status: 500/);
});
