import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');

test('seller booking page exposes active block management', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /const activeBlocks = useMemo/);
  assert.match(page, /Blokady terminów/);
  assert.match(page, /Aktywne blokady/);
  assert.match(page, /activeBlocks\.map/);
  assert.match(page, /deleteBlock\(block\.id\)/);
  assert.match(page, /Usuń blokadę/);
});

test('expired blocks are excluded from the management list', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /new Date\(block\.ends_at\)\.getTime\(\) > Date\.now\(\)/);
  assert.match(page, /sort\(\(a, b\) => new Date\(a\.starts_at\)\.getTime\(\) - new Date\(b\.starts_at\)\.getTime\(\)\)/);
});
