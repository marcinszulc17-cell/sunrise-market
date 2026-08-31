import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(new URL("../supabase/functions/checkout/index.ts", import.meta.url), "utf8");
const retry = await readFile(new URL("../supabase/functions/retry-seller-settlements/index.ts", import.meta.url), "utf8");

function namespaceOf(source) {
  return source.match(/const NS = "([^"]+)";/)?.[1] ?? null;
}

test("seller payout checkout and retry use the same UUID namespace", () => {
  assert.equal(namespaceOf(retry), namespaceOf(checkout));
  assert.match(checkout, /market:seller:\$\{orderId\}:\$\{sellerId\}/);
  assert.match(retry, /market:seller:\$\{row\.order_id\}:\$\{row\.seller_id\}/);
});
