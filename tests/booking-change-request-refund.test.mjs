import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/SellerBookingChangeRequests.tsx", import.meta.url), "utf8");

test("paid cancellation requests use the full booking refund flow", () => {
  assert.match(source, /seller_booking_dashboard_v2/);
  assert.match(source, /if \(booking\.paid_at\)/);
  assert.match(source, /functions\.invoke\("booking-cancel-refund"/);
  assert.match(source, /cashback\/prowizje/);
  assert.match(source, /seller_booking_set_status/);
  assert.match(source, /nieopłaconą rezerwację/);
});
