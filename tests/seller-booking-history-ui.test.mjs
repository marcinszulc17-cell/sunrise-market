import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = fs.readFileSync(new URL('../src/pages/SellerBookingsManage.tsx', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('../src/components/BookingChangeHistory.tsx', import.meta.url), 'utf8');

test('seller booking cards expose lazy change history', () => {
  assert.match(page, /BookingChangeHistory/);
  assert.match(page, /<BookingChangeHistory bookingId=\{r\.id\}/);
  assert.match(history, /seller_booking_change_history/);
  assert.match(history, /if \(!next \|\| loaded\) return/);
});

test('history clearly shows before and after state plus locked price policy', () => {
  assert.match(history, /BYŁO/);
  assert.match(history, /JEST/);
  assert.match(history, /old_resource_name/);
  assert.match(history, /new_resource_name/);
  assert.match(history, /zablokowana przy rezerwacji/);
  assert.match(history, /locked_amount_gross/);
});
