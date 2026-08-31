import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const availability = await readFile(new URL("../src/lib/marketBookingAvailability.ts", import.meta.url), "utf8");
const quick = await readFile(new URL("../src/lib/quickBookingDeepLink.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

test("availability summary links appointment cards to quick nearest booking", () => {
  assert.match(availability, /params\.set\("quick", "nearest"\)/);
  assert.match(availability, /data-booking-availability-summary/);
  assert.match(availability, /Najbliższy termin:/);
});

test("quick booking deep link selects existing nearest-slot action", () => {
  assert.match(quick, /params\.get\("quick"\) === "nearest"/);
  assert.match(quick, /Najbliższy wolny termin/);
  assert.match(quick, /button\.click\(\)/);
});

test("quick booking deep link is started with market enhancements", () => {
  assert.match(main, /startQuickBookingDeepLink\(\)/);
});
