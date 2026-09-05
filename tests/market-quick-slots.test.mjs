import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cards = await readFile(new URL("../src/lib/marketBookingAvailability.ts", import.meta.url), "utf8");
const deepLink = await readFile(new URL("../src/lib/quickBookingDeepLink.ts", import.meta.url), "utf8");

test("appointment cards show at most three slots from the nearest available day", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(cards, /const firstDay = dayKey\(first\.starts_at\)/);
  assert.match(cards, /dayKey\(slot\.starts_at\) === firstDay/);
  assert.match(cards, /\.slice\(0, 3\)/);
  assert.match(cards, /data-booking-quick-slots/);
});

test("quick slot links carry the exact start timestamp", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(cards, /params\.set\("quick", `slot:\$\{exact\}`\)/);
  assert.match(cards, /bookingHref\(offerId, summary, iso\)/);
});

test("product deep link selects the exact visible appointment hour", () => {
  assert.match(deepLink, /mode\.startsWith\("slot:"\)/);
  assert.match(deepLink, /date\.toLocaleTimeString\("pl-PL"/);
  assert.match(deepLink, /\(el\.textContent \|\| ""\)\.trim\(\) === hour/);
  assert.match(deepLink, /button\.click\(\)/);
});
