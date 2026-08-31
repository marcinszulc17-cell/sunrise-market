import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/components/BookingPurchaseModal.tsx", import.meta.url), "utf8");

assert.match(source, /resourceId:\s*selected\.resource_id\s*\?\?\s*resourceId/);
assert.match(source, /Najbliższy wolny termin/);
assert.match(source, /concreteResourceId\s*=\s*selected\?\.resource_id\s*\?\?\s*resourceId/);
assert.match(source, /Dowolny dostępny/);

console.log("buyer booking concrete resource contract: ok");
