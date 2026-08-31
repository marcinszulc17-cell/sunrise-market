import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const setup = fs.readFileSync(new URL('../src/pages/SellerBookingSetup.tsx', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/components/ServiceResourceAssignments.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260831_seller_booking_service_resource_assignments.sql', import.meta.url), 'utf8');

test('seller booking setup renders service to resource assignments', () => {
  assert.match(setup, /ServiceResourceAssignments/);
  assert.match(setup, /service_resources:\{service_id:string;resource_id:string\}\[\]/);
  assert.match(setup, /mappings=\{cat\.service_resources\|\|\[\]\}/);
});

test('assignment UI saves explicit resources and supports all resources fallback', () => {
  assert.match(ui, /seller_booking_service_resources_replace/);
  assert.match(ui, /p_resources: selected\(serviceId\)/);
  assert.match(ui, /Każdy aktywny zasób tej oferty/);
  assert.match(ui, /Każdy dostępny/);
});

test('assignment RPC validates seller offer service and active linked resources', () => {
  assert.match(migration, /booking_service_resources/);
  assert.match(migration, /booking_offer_resources/);
  assert.match(migration, /r\.seller_id=v_seller and r\.active/);
  assert.match(migration, /Usługa nie należy do tej oferty/);
  assert.match(migration, /revoke execute on function market\.seller_booking_service_resources_replace\(uuid,uuid,uuid\[\]\) from anon/);
  assert.match(migration, /grant execute on function market\.seller_booking_service_resources_replace\(uuid,uuid,uuid\[\]\) to authenticated/);
});
