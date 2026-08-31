import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modal = await readFile(new URL("../src/components/BookingPurchaseModal.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831162500_exclude_booking_deposit_from_cashback.sql", import.meta.url), "utf8");

test("booking UI includes deposit in payable amount but excludes it from cashback", () => {
  assert.match(modal, /const payableTotal = total \+ deposit;/);
  assert.match(modal, /const cashback = cashbackFor\(total, cashbackRate\);/);
  assert.match(modal, /Do zapłaty[\s\S]*zl\(payableTotal\)/);
  assert.match(modal, /Rezerwuję i płacę \$\{zl\(payableTotal\)\}/);
  assert.match(modal, /Kaucja .*nie jest naliczana do cashbacku/);
});

test("orders with deposits cannot persist cashback calculated from the deposit", () => {
  assert.match(migration, /trg_orders_exclude_deposit_from_cashback/);
  assert.match(migration, /coalesce\(new\.total_gross, 0\)[\s\S]*- coalesce\(new\.deposit_gross, 0\)/);
  assert.match(migration, /new\.cashback_amount := round\(v_base \* greatest\(v_rate, 0\), 2\);/);
});
