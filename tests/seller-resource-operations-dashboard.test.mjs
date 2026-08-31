import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../src/components/SellerResourceOperationsDashboard.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831_seller_resource_operations_dashboard.sql", import.meta.url), "utf8");

test("resource operations dashboard exposes operational fleet states", () => {
  for (const label of ["W użyciu", "Wolne", "Serwis", "Awaria", "Blokada / wyłączone"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /Najbliższe rezerwacje i zwroty/);
});

test("operations rpc combines current and next booking with operational status", () => {
  assert.match(migration, /seller_resource_operations_dashboard/);
  assert.match(migration, /current_booking/);
  assert.match(migration, /next_booking/);
  assert.match(migration, /\[STATUS\] Serwis/);
  assert.match(migration, /'occupied'/);
});

test("seller routes expose operations center", () => {
  assert.match(main, /SellerResourceOperationsPage/);
  assert.match(main, /\/sprzedawca\/rezerwacje\/operacje/);
  assert.match(main, /startSellerResourceOperationsNav\(\)/);
});
