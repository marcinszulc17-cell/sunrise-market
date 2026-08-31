import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/SprzedawcaStart.tsx", import.meta.url), "utf8");

test("seller center exposes only three primary offer models", () => {
  assert.match(source, /title: "Sprzedaż"[\s\S]*mode: "purchase"/);
  assert.match(source, /title: "Usługa na termin"[\s\S]*mode: "appointment"/);
  assert.match(source, /title: "Wynajem"[\s\S]*mode: "daily"/);
  assert.doesNotMatch(source, /Sprzedaż samochodu|Wynajem samochodu|Sprzedaż nieruchomości|Najem \/ nocleg|Ogłoszenie lokalne/);
  assert.match(source, /to={`\/sprzedawca\/wystaw\?mode=\${type\.mode}`}/);
  assert.match(source, /Kategorię .* wybierzesz w uniwersalnym kreatorze/);
});
