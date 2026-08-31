import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(new URL("../supabase/functions/checkout/index.ts", import.meta.url), "utf8");

test("booking checkout excludes refundable deposit from cashback base", () => {
  assert.match(checkout, /select\("total_gross,deposit_gross,invoice_snapshot_at"\)/);
  assert.match(checkout, /const refundableDeposit = bookingId \? money\(Number\(ord0\?\.deposit_gross \?\? 0\)\) : 0;/);
  assert.match(checkout, /const cashbackBase = money\(Math\.max\(0, discountedProducts - refundableDeposit\)\);/);
  assert.match(checkout, /const cashback = money\(cashbackBase \* cashbackRate\);/);
});

test("booking total still includes the refundable deposit", () => {
  assert.match(checkout, /const finalTotal = money\(discountedProducts \+ shipCost\);/);
  assert.match(checkout, /const amountGrosz = Math\.round\(finalTotal \* 100\);/);
});
