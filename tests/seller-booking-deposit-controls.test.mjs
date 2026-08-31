import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/SellerBookingsManage.tsx", import.meta.url), "utf8");

test("seller booking dashboard exposes deposit state and actions", () => {
  assert.match(page, /deposit_gross\?: number/);
  assert.match(page, /deposit_status\?: string \| null/);
  assert.match(page, /booking-deposit-action/);
  assert.match(page, /Zwróć kaucję/);
  assert.match(page, /Zatrzymaj kaucję/);
  assert.match(page, /Kaucja jest rozliczana osobno od ceny wynajmu i nie generuje cashbacku ani prowizji Ambassador Club/);
});

test("deposit action eligibility is restricted to terminal booking states", () => {
  assert.match(page, /\["cancelled", "completed", "no_show"\]\.includes\(r\.status\)/);
  assert.match(page, /\["completed", "no_show"\]\.includes\(r\.status\)/);
});
