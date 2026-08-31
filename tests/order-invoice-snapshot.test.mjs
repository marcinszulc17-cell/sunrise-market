import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_order_invoice_snapshot.sql', import.meta.url), 'utf8');
const checkout = fs.readFileSync(new URL('../supabase/functions/checkout/index.ts', import.meta.url), 'utf8');
const cart = fs.readFileSync(new URL('../src/pages/Koszyk.tsx', import.meta.url), 'utf8');
const booking = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');
const intent = fs.readFileSync(new URL('../src/lib/checkoutIntent.ts', import.meta.url), 'utf8');
const fields = fs.readFileSync(new URL('../src/components/InvoiceDetailsFields.tsx', import.meta.url), 'utf8');

test('orders persist a complete immutable invoice snapshot', () => {
  for (const column of ['invoice_requested', 'invoice_company_name', 'invoice_tax_id', 'invoice_street', 'invoice_city', 'invoice_postal', 'invoice_country', 'invoice_snapshot_at']) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /orders_invoice_snapshot_complete/);
  assert.match(migration, /protect_order_invoice_snapshot/);
  assert.match(migration, /Dane faktury są historycznym snapshotem zamówienia/);
});

test('checkout validates invoice details and snapshots even the no-invoice decision', () => {
  assert.match(checkout, /function validPolishNip/);
  assert.match(checkout, /function invoiceSnapshot/);
  assert.match(checkout, /invoice_requested: false/);
  assert.match(checkout, /invoice_snapshot_at: now/);
  assert.match(checkout, /const \{ items, booking_id, shipping_code, shipping_codes, shipping, invoice, coupon, payment_method \}/);
  assert.match(checkout, /invoiceSnapshot\(invoice\)/);
  assert.match(checkout, /invoice_snapshot_at/);
});

test('cart and booking use the same invoice checkout payload and UI', () => {
  assert.match(cart, /InvoiceDetailsFields/);
  assert.match(cart, /checkoutWithInvoice/);
  assert.match(cart, /invoiceComplete\(invoice\)/);
  assert.match(booking, /InvoiceDetailsFields/);
  assert.match(booking, /checkoutWithInvoice\(\{ booking_id: hold\.booking_id, payment_method: payment \}, invoice\)/);
  assert.match(booking, /Uzupełnij dane do faktury/);
  assert.match(fields, /Chcę fakturę VAT/);
});

test('invoice details survive wallet topup and resume', () => {
  assert.match(intent, /invoice\?: InvoiceDetails/);
  assert.match(cart, /saveIntent\(\{[^}]*invoice/s);
  assert.match(cart, /if \(intent\.invoice\) setInvoice\(intent\.invoice\)/);
  assert.match(cart, /intent\.invoice \?\? \{ \.\.\.EMPTY_INVOICE \}/);
});
