import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidebar = await readFile(new URL("../src/components/SellerBookingOpsSidebar.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831190000_seller_booking_refund_status_dashboard.sql", import.meta.url), "utf8");

test("seller booking sidebar persists unresolved refund alerts", () => {
  assert.match(sidebar, /seller_booking_refund_status_dashboard/);
  assert.match(sidebar, /Niedokończone zwroty/);
  assert.match(sidebar, /blocked_bonus/);
  assert.match(sidebar, /payment_failed/);
  assert.match(sidebar, /finalize_failed/);
});

test("refund status RPC only exposes unresolved refunds owned by seller or operator", () => {
  assert.match(migration, /b\.seller_id = market\.current_seller_id\(\) or market\.is_operator\(\)/);
  assert.match(migration, /'preparing','blocked_bonus','payment_failed','finalize_failed'/);
  assert.match(migration, /grant execute on function market\.seller_booking_refund_status_dashboard\(\) to authenticated/);
});
