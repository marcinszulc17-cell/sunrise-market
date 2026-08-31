import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/marketRentalQuickQuote.ts", import.meta.url), "utf8");

test("rental quick quote validates the full selected range", () => {
  assert.match(source, /bookingUnavailableDaysV2\(offerId, fromDay, toDay\)/);
  assert.match(source, /row\.day >= fromDay && row\.day < toDay/);
  assert.match(source, /Wybrany okres jest już zajęty/);
});

test("rental card shows cashback from the shared market config", () => {
  assert.match(source, /getMarketConfig\(\)/);
  assert.match(source, /cashbackFor\(quote\.base, config\.cashbackRate\)/);
  assert.match(source, /Cashback \$\{Math\.round\(config\.cashbackRate \* 10000\) \/ 100\}%/);
});

test("busy rental ranges cannot be clicked through to booking", () => {
  assert.match(source, /link\.style\.pointerEvents = "none"/);
  assert.match(source, /link\.style\.opacity = "\.55"/);
});
