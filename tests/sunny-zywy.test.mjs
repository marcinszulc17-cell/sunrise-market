import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dymekDlaStrony, dymekKoszyk, juzPowiedzial, zapamietaj, ZDARZENIE_KOSZYK } from "../src/lib/sunnyZycie.ts";

// Zgłoszenie właściciela 20.11.2026: „Sunny w markecie… dobrze gdyby on był żywy. Tak jak pies InPostu”.
test("dymek pasuje do strony", () => {
  assert.equal(dymekDlaStrony("/produkt/abc").klucz, "produkt");
  assert.equal(dymekDlaStrony("/szukaj?q=x").klucz, "szukaj");
  assert.equal(dymekDlaStrony("/noclegi").klucz, "rezerwacje");
  assert.equal(dymekDlaStrony("/").klucz, "start");
});
test("koszyk: podskok i skrócony tytuł", () => {
  const d = dymekKoszyk("Magazyn energii 10 kWh – montaż (bez falownika) w całej Polsce");
  assert.equal(d.poza, "skacze");
  assert.ok(d.tekst.includes("…"));
  assert.match(dymekKoszyk("").tekst, /Dodane do koszyka/);
});
test("ten sam dymek tylko raz na sesję; bez pamięci — milczy", () => {
  const m = new Map(); const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(juzPowiedzial("produkt", s), false);
  zapamietaj("produkt", s);
  assert.equal(juzPowiedzial("produkt", s), true);
  assert.equal(juzPowiedzial("szukaj", s), false);
  assert.equal(juzPowiedzial("x", { getItem: () => { throw new Error("blokada"); } }), true);
});
test("koszyk wysyła zdarzenie, które słucha Sunny; ruch wyłącza się przy reduced-motion", async () => {
  const cart = await readFile(new URL("../src/lib/cart.ts", import.meta.url), "utf8");
  const chat = await readFile(new URL("../src/components/SuriChat.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.ok(cart.includes(ZDARZENIE_KOSZYK));
  assert.match(chat, /addEventListener\(ZDARZENIE_KOSZYK/);
  assert.match(chat, /sunny-wave\.webp/);
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*sunny-fab/);
});
