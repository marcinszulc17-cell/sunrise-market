import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entry = await readFile(new URL("../src/pages/SprzedawcaWystaw.tsx", import.meta.url), "utf8");
const wizard = await readFile(new URL("../src/pages/SprzedawcaV2.tsx", import.meta.url), "utf8");

test("seller entry exposes exactly three primary modes", () => {
  assert.match(entry, /title: "Sprzedaż"/);
  assert.match(entry, /title: "Usługa na termin"/);
  assert.match(entry, /title: "Wynajem"/);
  assert.equal((entry.match(/mode: "(purchase|appointment|daily)"/g) || []).length, 3);
});

test("selected mode is forwarded to universal seller wizard", () => {
  assert.match(entry, /mode=\$\{item\.mode\}/);
  assert.match(entry, /return <SprzedawcaV2 \/>/);
});

test("booking offers continue into calendar setup after publish", () => {
  assert.match(wizard, /purchaseMode !== "purchase"/);
  assert.match(wizard, /configureBookingOffer/);
  assert.match(wizard, /rezerwacje\/ustawienia\/\$\{offerId\}\?new=1/);
});
