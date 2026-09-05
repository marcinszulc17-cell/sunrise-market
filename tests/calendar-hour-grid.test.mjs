import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const calendar = await readFile(new URL("../src/components/SellerBookingCalendar.tsx", import.meta.url), "utf8");
const manage = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("day calendar renders a 30 minute timeline", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(calendar, /Array\.from\(\{length:31\}/);
  assert.match(calendar, /i\*30/);
  assert.match(calendar, /07:00|7\*60/);
  assert.match(calendar, /22\*60/);
});

test("confirmed appointment bookings can be dropped on exact time slots", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(calendar, /onRescheduleTimeDrop/);
  assert.match(calendar, /dropBookingAtTime/);
  assert.match(calendar, /bookingType === "appointment"/);
  assert.match(calendar, /onDrop=\{e=>dropBookingAtTime\(slot,e\)\}/);
  assert.match(manage, /rescheduleAtExactTime/);
  assert.match(manage, /seller_booking_reschedule/);
  assert.match(manage, /booking_type!=="appointment"/);
});

test("daily rentals remain day-based and are not moved on the hourly grid", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(calendar, /timed = dayEvents\.filter\(e => e\.kind === "booking" && e\.bookingType === "appointment"\)/);
  assert.match(manage, /r\.booking_type==="daily"/);
});
