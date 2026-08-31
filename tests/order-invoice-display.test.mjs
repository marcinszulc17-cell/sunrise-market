import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const buyer = fs.readFileSync(new URL('../src/pages/Zamowienia.tsx', import.meta.url), 'utf8');
const seller = fs.readFileSync(new URL('../src/pages/SellerOrders.tsx', import.meta.url), 'utf8');
const center = fs.readFileSync(new URL('../src/pages/SprzedawcaStart.tsx', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_order_invoice_snapshot_views.sql', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../src/components/InvoiceSnapshotCard.tsx', import.meta.url), 'utf8');

test('buyer order view renders immutable invoice snapshot', () => {
  assert.match(buyer, /InvoiceSnapshotCard/);
  assert.match(buyer, /o\.invoice\?\.requested/);
  assert.match(card, /historyczny snapshot zamówienia/i);
  assert.doesNotMatch(card, /<input|<textarea|contentEditable/);
});

test('seller center exposes dedicated orders and invoices view', () => {
  assert.match(center, /\/sprzedawca\/zamowienia/);
  assert.match(center, /Zamówienia i faktury/);
  assert.match(routes, /path="\/sprzedawca\/zamowienia" element=\{<SellerOrders \/>\}/);
  assert.match(seller, /InvoiceSnapshotCard invoice=\{order\.invoice\} showNoInvoice/);
  assert.match(seller, /zamrożone dane firmy i NIP|historycznym snapshotem/i);
});

test('order RPCs expose invoice snapshot only through authenticated ownership scopes', () => {
  assert.match(migration, /where o\.buyer_id=auth\.uid\(\)/);
  assert.match(migration, /oi\.seller_id=\(select id from my\)/);
  assert.match(migration, /market\.current_seller_id\(\)/);
  assert.match(migration, /'requested', o\.invoice_requested/);
  assert.match(migration, /'tax_id', o\.invoice_tax_id/);
  assert.match(migration, /revoke execute on function market\.my_orders\(\) from anon/);
  assert.match(migration, /revoke execute on function market\.seller_orders\(\) from anon/);
  assert.match(migration, /grant execute on function market\.my_orders\(\) to authenticated/);
  assert.match(migration, /grant execute on function market\.seller_orders\(\) to authenticated/);
});
