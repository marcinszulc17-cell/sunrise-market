import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/booking-deposit-action/index.ts", import.meta.url), "utf8");

test("Sunrise Pay booking deposit actions use deterministic UUID idempotency keys", () => {
  assert.match(edge, /async function uuidv5\(name: string\)/);
  assert.match(edge, /const idem = await uuidv5\(idemName\);/);
  assert.match(edge, /idempotency_key: idem/);
  assert.match(edge, /booking-deposit-refund:\$\{bookingId\}/);
  assert.match(edge, /booking-deposit-retain:\$\{bookingId\}/);
});
