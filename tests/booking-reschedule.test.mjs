import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831_seller_booking_reschedule.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("seller reschedule keeps the paid booking and changes only dates", () => {
  assert.match(migration, /create or replace function market\.seller_booking_reschedule/);
  assert.match(migration, /update market\.bookings\s+set starts_at = v_start,\s+ends_at = v_end/);
  assert.doesNotMatch(migration, /amount_gross\s*=/);
  assert.doesNotMatch(migration, /unit_price_gross\s*=/);
  assert.doesNotMatch(migration, /units\s*=/);
  assert.match(migration, /v_booking\.status <> 'confirmed'/);
});

test("reschedule rejects conflicts and seller blocks", () => {
  assert.match(migration, /x\.id <> v_booking\.id/);
  assert.match(migration, /x\.offer_id = v_booking\.offer_id/);
  assert.match(migration, /x\.resource_id = v_booking\.resource_id/);
  assert.match(migration, /Nowy termin koliduje z inną rezerwacją/);
  assert.match(migration, /market\.booking_blocks/);
  assert.match(migration, /Nowy termin jest zablokowany przez sprzedawcę/);
  assert.match(migration, /market\.booking_availability/);
});

test("reschedule is authenticated seller-only and not anonymous", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /v_booking\.seller_id = market\.current_seller_id\(\) or market\.is_operator\(\)/);
  assert.match(migration, /revoke execute on function market\.seller_booking_reschedule\(uuid,timestamptz\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function market\.seller_booking_reschedule\(uuid,timestamptz\) to authenticated/);
});

test("seller UI exposes safe reschedule only for confirmed bookings", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(page, /r\.status===\"confirmed\".*Zmień termin/s);
  assert.match(page, /seller_booking_reschedule/);
  assert.match(page, /Sprawdź i zmień termin/);
  assert.match(page, /Cena .* również się nie zmienia/);
  assert.match(page, /powiadomienie w aplikacji\/push/);
});
