import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dedykowany = await readFile(new URL("../src/pages/DedicatedOfferWizard.tsx", import.meta.url), "utf8");
const prywatny = await readFile(new URL("../src/pages/PrivateOfferWizard.tsx", import.meta.url), "utf8");
const wejscie = await readFile(new URL("../src/pages/SprzedawcaWystaw.tsx", import.meta.url), "utf8");
const noclegi = await readFile(new URL("../src/pages/Noclegi.tsx", import.meta.url), "utf8");

// market.search_stays filtruje `c.slug like 'noclegi%'`, a SellerBookingSetup włącza ustawienia
// obiektu po tym samym prefiksie. Kreator, który nie potrafi trafić w tę gałąź, tworzy oferty
// noclegowe niewidoczne w /noclegi (zgłoszenie właściciela 2026-09-25).
test("dedicated wizard can publish into the noclegi branch", () => {
  assert.match(dedykowany, /nocleg: \{[^}]*root: "noclegi"/);
  assert.match(dedykowany, /if \(type === "nocleg"\) return \["daily"\]/);
});

test("private rental wizard offers a stay option rooted in noclegi", () => {
  assert.match(prywatny, /\{ id: "stay", icon: "🏡", title: "Nocleg", root: "noclegi" \}/);
  assert.match(prywatny, /type RentalKind = "product" \| "stay" \| "car" \| "property"/);
});

test("publish entry routes typ=nocleg and refuses unknown types", () => {
  assert.match(wejscie, /if \(type === "nocleg"\) return <DedicatedOfferWizard \/>/);
  assert.match(wejscie, /TYPY_OFERT\.includes\(type\)/);
});

test("empty stay search sends the owner to the stay wizard", () => {
  assert.match(noclegi, /\/sprzedawca\/wystaw\?typ=nocleg/);
  assert.doesNotMatch(noclegi, /wystaw\?typ=produkt&mode=daily/);
});

// market.configure_booking_offer (stay_readiness) nie opublikuje noclegu poniżej 5 zdjęć
// i 200 znaków opisu. Kreator musi to powiedzieć zawczasu, a nie pozwolić zapisać ofertę,
// której potem nie da się aktywować.
test("stay wizard enforces the same thresholds as publication", () => {
  assert.match(dedykowany, /const isNocleg = type === "nocleg"/);
  assert.match(dedykowany, /MIN_ZDJEC_NOCLEG = 5, MIN_OPIS_NOCLEG = 200/);
  assert.match(dedykowany, /isNocleg && images\.length < MIN_ZDJEC_NOCLEG/);
  assert.match(dedykowany, /isNocleg && description\.trim\(\)\.length < MIN_OPIS_NOCLEG/);
});
