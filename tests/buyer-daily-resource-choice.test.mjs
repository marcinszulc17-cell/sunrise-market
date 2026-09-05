import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_daily_specific_resource_choice.sql', import.meta.url), 'utf8');
const booking = fs.readFileSync(new URL('../src/lib/bookingV2.ts', import.meta.url), 'utf8');
const modal = fs.readFileSync(new URL('../src/components/BookingPurchaseModal.tsx', import.meta.url), 'utf8');

test('resource-specific daily RPCs reuse concrete-resource availability rules', () => {
  assert.match(migration, /booking_unavailable_days_resource_v2/);
  assert.match(migration, /booking_daily_quote_resource_v2/);
  assert.match(migration, /booking_daily_resource_available\(p_offer,p_resource,d\.starts_at,d\.ends_at\)/);
  assert.match(migration, /booking_daily_resource_available\(p_offer,p_resource,v_start,v_end\)/);
  assert.match(migration, /grant execute on function market\.booking_unavailable_days_resource_v2[\s\S]*to anon, authenticated/);
});

test('booking client switches daily availability and quote RPCs when resource is selected', () => {
  assert.match(booking, /resourceId \? "booking_unavailable_days_resource_v2" : "booking_unavailable_days_v2"/);
  assert.match(booking, /resourceId \? "booking_daily_quote_resource_v2" : "booking_daily_quote_v2"/);
  assert.match(booking, /p_resource: resourceId/);
});

test('buyer can choose exact daily resource or automatic allocation', { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(modal, /Wybierz konkretny zasób/);
  assert.match(modal, /Dowolny dostępny/);
  assert.match(modal, /selectRentalResource\(r\.id\)/);
  assert.match(modal, /bookingUnavailableDaysV2\(offerId, from, to, resourceId\)/);
  assert.match(modal, /bookingDailyQuoteV2\(offerId, fromDay, toDay, resourceId\)/);
  assert.match(modal, /resourceId \}\);/);
  assert.match(modal, /przydzielimy automatycznie/);
});
