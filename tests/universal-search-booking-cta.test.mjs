import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/AdvancedSearchUniversal.tsx", import.meta.url), "utf8");

test("universal search results expose purchase mode and booking deep links", () => {
  assert.match(source, /offerDetailHref/);
  assert.match(source, /purchase_mode/);
  assert.match(source, /Usługa na termin/);
  assert.match(source, /Umów termin/);
  assert.match(source, /Wynajem/);
  assert.match(source, /Wybierz daty/);
  assert.match(source, /offerDetailHref\(o\.offer_id,true\)/);
});
