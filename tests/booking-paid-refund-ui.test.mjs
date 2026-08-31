import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const queue = await readFile(new URL("../src/components/SellerBookingRefundQueue.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../src/components/SellerBookingOpsSidebar.tsx", import.meta.url), "utf8");

test("seller has a dedicated safe refund action for paid bookings", () => {
  assert.match(sidebar, /SellerBookingRefundQueue/);
  assert.match(queue, /booking-cancel-refund/);
  assert.match(queue, /Anuluj i zwróć pełną płatność/);
  assert.match(queue, /bonus_points_already_used/);
  assert.match(queue, /Opłacona — do akceptacji/);
  assert.match(queue, /\["held", "pending_payment", "confirmed"\]/);
});
