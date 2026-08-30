import assert from "node:assert/strict";
import fs from "node:fs";

const src=fs.readFileSync(new URL("../src/components/SellerBookingCalendar.tsx",import.meta.url),"utf8");

assert.match(src,/function WeekTimeline/);
assert.match(src,/repeat\(7,minmax\(126px,1fr\)\)/);
assert.match(src,/START_MIN=7\*60/);
assert.match(src,/END_MIN=22\*60/);
assert.match(src,/i\*30/);
assert.match(src,/onRescheduleTimeDrop/);
assert.match(src,/dropBookingAtTime/);
assert.match(src,/bookingType==="appointment"/);
assert.match(src,/bookingType==="daily"/);
assert.match(src,/WYNAJMY DOBOWE/);
assert.match(src,/Przeciągnij wizytę między dniami i godzinami/);

console.log("calendar week hour grid contract: ok");
