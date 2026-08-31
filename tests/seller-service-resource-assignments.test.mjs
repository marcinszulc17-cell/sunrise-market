import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const setup = fs.readFileSync(new URL('../src/pages/SellerBookingSetup.tsx', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../src/components/ServiceResourceAssignments.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_service_resource_assignments.sql', import.meta.url), 'utf8');

test('seller booking setup exposes service-to-resource assignment UI for appointments', () => {
  assert.match(setup, /ServiceResourceAssignments/);
  assert.match(setup, /service_resources/);
  assert.match(setup, /!isDaily&&cat\.services\.length>0/);
});

test('assignment UI supports each service using all or selected resources', () => {
  assert.match(component, /Każdy aktywny zasób tej oferty/);
  assert.match(component, /seller_booking_service_resources_replace/);
  assert.match(component, /p_resources: selected\(serviceId\)/);
  assert.match(component, /Zapisz przypisanie/);
});

test('backend validates offer/service/resource ownership and keeps write RPC authenticated-only', () => {
  assert.match(migration, /s\.id=p_service and s\.offer_id=p_offer/);
  assert.match(migration, /bor\.offer_id=p_offer/);
  assert.match(migration, /r\.seller_id=v_seller and r\.active/);
  assert.match(migration, /'service_resources'/);
  assert.match(migration, /revoke execute on function market\.seller_booking_service_resources_replace\(uuid,uuid,uuid\[\]\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_service_resources_replace\(uuid,uuid,uuid\[\]\) to authenticated/);
});
