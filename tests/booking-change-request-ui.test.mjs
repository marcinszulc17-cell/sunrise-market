import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const buyer = fs.readFileSync(new URL('../src/pages/Rezerwacje.tsx', import.meta.url), 'utf8');
const seller = fs.readFileSync(new URL('../src/components/SellerBookingChangeRequests.tsx', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../src/components/SellerBookingOpsSidebar.tsx', import.meta.url), 'utf8');

test('buyer can submit, edit and withdraw booking change requests', () => {
  assert.match(buyer, /buyer_booking_change_requests/);
  assert.match(buyer, /buyer_booking_change_request_submit/);
  assert.match(buyer, /buyer_booking_change_request_withdraw/);
  assert.match(buyer, /Poproś o zmianę \/ anulowanie/);
  assert.match(buyer, /Edytuj prośbę/);
  assert.match(buyer, /Wycofaj/);
});

test('seller inbox uses canonical booking operations to accept requests', () => {
  assert.match(seller, /seller_booking_change_requests/);
  assert.match(seller, /seller_booking_change_request_reject/);
  assert.match(seller, /seller_booking_reschedule/);
  assert.match(seller, /seller_booking_set_status/);
  assert.doesNotMatch(seller, /seller_booking_change_request_accept/);
});

test('seller booking operations surface the request inbox', () => {
  assert.match(sidebar, /SellerBookingChangeRequests/);
  assert.match(sidebar, /<SellerBookingChangeRequests \/>/);
});
