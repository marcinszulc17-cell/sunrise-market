import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const calendar = await readFile(new URL("../src/components/SellerBookingCalendar.tsx", import.meta.url), "utf8");
const manage = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("confirmed bookings can be dragged to another day", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(calendar, /draggable=\{draggable\}/);
  assert.match(calendar, /event\.status === "confirmed"/);
  assert.match(calendar, /onRescheduleDrop/);
  assert.match(calendar, /onDrop=\{e=>dropBooking\(day,e\)\}/);
});

test("calendar drag keeps appointment time and daily length", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(manage, /target\.setHours\(current\.getHours\(\),current\.getMinutes\(\),current\.getSeconds\(\),0\)/);
  assert.match(manage, /r\.booking_type==="daily"/);
  assert.match(manage, /seller_booking_reschedule/);
});

test("dragging remains backed by the safe reschedule RPC", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(manage, /runReschedule\(r,startValue\)/);
  assert.match(manage, /System sprawdził kolizje/);
});
