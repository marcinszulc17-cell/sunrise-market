import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/OperatorBookingRefundExceptions.tsx", import.meta.url), "utf8");
const router = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831210000_operator_booking_refund_exceptions.sql", import.meta.url), "utf8");

test("operator has a read-only queue for booking refund exceptions", () => {
  assert.match(router, /\/operator\/refundy-rezerwacji/);
  assert.match(page, /operator_booking_refund_exceptions/);
  assert.match(page, /Bonusy wykorzystane — ręczne rozliczenie/);
  assert.match(page, /Płatność zwrócona — finalizacja wymaga naprawy/);
  assert.match(page, /Nie wysyłaj drugiego zwrotu/);
});

test("refund exception RPC is operator-only and hides transient preparing rows", () => {
  assert.match(migration, /not market\.is_operator\(\)/);
  assert.match(migration, /blocked_bonus/);
  assert.match(migration, /payment_failed/);
  assert.match(migration, /finalize_failed/);
  assert.match(migration, /preparing[\s\S]*15 minutes/);
  assert.match(migration, /grant execute[\s\S]*authenticated/);
});