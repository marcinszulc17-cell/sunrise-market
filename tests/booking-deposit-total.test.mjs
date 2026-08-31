import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modal = await readFile(new URL("../src/components/BookingPurchaseModal.tsx", import.meta.url), "utf8");

test("booking payment total includes deposit while cashback excludes it", () => {
  assert.match(modal, /const paymentTotal = total \+ deposit;/);
  assert.match(modal, /const cashback = cashbackFor\(total, cashbackRate\);/);
  assert.match(modal, /\{zl\(paymentTotal\)\}/);
  assert.match(modal, /Kaucja .*jest wliczona w kwotę płatności/);
  assert.match(modal, /Rezerwuję i płacę \$\{zl\(paymentTotal\)\}/);
});
