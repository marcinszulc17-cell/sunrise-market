import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const ui = fs.readFileSync(new URL("../src/components/SellerResourceOperationsDashboard.tsx", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase/migrations/20260831_resource_operations_alerts.sql", import.meta.url), "utf8");

test("operations dashboard exposes urgent alert categories", () => {
  assert.match(ui, /Spóźniony zwrot/);
  assert.match(ui, /Start za/);
  assert.match(ui, /Zwrot za/);
  assert.match(ui, /Kończy się blokada\/serwis/);
  assert.match(ui, /WYMAGA UWAGI/);
});

test("alerts are prioritized and refreshed", () => {
  assert.match(ui, /priority: 0/);
  assert.match(ui, /startMinutes.*<= 30/s);
  assert.match(ui, /returnMinutes.*<= 120/s);
  assert.match(ui, /maintenanceMinutes.*<= 24 \* 60/s);
  assert.match(ui, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 30000\)/);
});

test("backend returns overdue and maintenance timing", () => {
  assert.match(sql, /overdue_booking_id uuid/);
  assert.match(sql, /maintenance_reason text/);
  assert.match(sql, /b\.status='confirmed'/);
  assert.match(sql, /b\.ends_at <= now\(\)/);
  assert.match(sql, /booking_resource_time_off/);
});
