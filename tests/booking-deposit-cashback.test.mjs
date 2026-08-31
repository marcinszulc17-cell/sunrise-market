import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modal = await readFile(new URL("../src/components/BookingPurchaseModal.tsx", import.meta.url), "utf8");
const checkout = await readFile(new URL("../supabase/functions/checkout/index.ts", import.meta.url), "utf8");

test("booking UI includes refundable deposit in amount due", () => {
  assert.match(modal, /const amountDue = total \+ deposit;/);
  assert.match(modal, /Do zapłaty teraz/);
  assert.match(modal, /Rezerwuję i płacę \$\{zl\(amountDue\)\}/);
  assert.doesNotMatch(modal, /Kaucja .*nie jest pobierana w tej płatności online/);
});

test("booking cashback excludes refundable deposit", () => {
  assert.match(modal, /const cashback = cashbackFor\(total, cashbackRate\);/);
  assert.match(checkout, /select\("total_gross,deposit_gross,invoice_snapshot_at"\)/);
  assert.match(checkout, /const refundableDeposit = bookingId \? money\(Number\(ord0\?\.deposit_gross \?\? 0\)\) : 0;/);
  assert.match(checkout, /const cashbackBase = money\(Math\.max\(0, discountedProducts - refundableDeposit\)\);/);
  assert.match(checkout, /const cashback = money\(cashbackBase \* cashbackRate\);/);
});

test("booking payment still charges the deposit in total", () => {
  assert.match(checkout, /const finalTotal = money\(discountedProducts \+ shipCost\);/);
  assert.match(checkout, /const amountGrosz = Math\.round\(finalTotal \* 100\);/);
});
