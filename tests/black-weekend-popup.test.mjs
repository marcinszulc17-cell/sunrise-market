import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const popup = await readFile(new URL("../src/components/BlackWeekendPopup.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

// Decyzja właściciela 27.11.2026: okienko Black Weekend dla klientów Marketu.
test("okienko działa tylko 27–30.11.2026 (czas Europe/Warsaw)", () => {
  assert.match(popup, /2026-11-26T23:00:00Z/);
  assert.match(popup, /2026-11-30T23:00:00Z/);
});

test("nie przeszkadza przy płatności, logowaniu i w panelach", () => {
  assert.match(popup, /sprzedawca\|operator\|koszyk/);
  assert.match(popup, /login\|sso/);
});

test("prezent, nie rabat ani dotacja", () => {
  assert.match(popup, /w prezencie/);
  assert.doesNotMatch(popup, /dotacj|dofinansowan/i);
});

test("okienko jest podpięte w AppChrome", () => {
  assert.match(main, /<BlackWeekendPopup \/>/);
});
