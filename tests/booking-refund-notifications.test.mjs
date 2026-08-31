import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831192000_booking_refund_notifications.sql", import.meta.url), "utf8");

test("refund finalization notifies buyer and seller", () => {
  assert.match(migration, /booking_refunded','Rezerwacja anulowana — zwrot wykonany'/);
  assert.match(migration, /booking_refunded_seller','Rezerwacja anulowana i zwrócona'/);
  assert.match(migration, /Księgowanie po stronie banku może potrwać kilka dni/);
  assert.match(migration, /zaksięgowany w Sunrise Pay/);
});

test("paid order notification describes points and scheduled seller settlement accurately", () => {
  assert.match(migration, /Cashback został naliczony w punktach MySunrise/);
  assert.match(migration, /Do rozliczenia sprzedawcy przypisano/);
  assert.doesNotMatch(migration, /Cashback wróci na portfel/);
});