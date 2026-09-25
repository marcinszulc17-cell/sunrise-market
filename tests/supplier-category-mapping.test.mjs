import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

// Test wykonawczy, nie tekstowy: bierzemy prawdziwe nazwy produktów, które właściciel
// zobaczył w złych działach na sunrisemarket.pl (zgłoszenie 2026-09-25) i sprawdzamy,
// dokąd trafią po synchronizacji.
const source = fs.readFileSync(new URL("../supabase/functions/base-polzoo-sync/index.ts", import.meta.url), "utf8");
const od = source.indexOf("function classifyPolzoo");
const doKonca = source.indexOf("function pickInventory");
assert.ok(od > 0 && doKonca > od, "nie znalazłem bloku klasyfikatorów");
// Klasyfikatory to zwykły JavaScript z adnotacjami typów — zdejmujemy adnotacje i
// uruchamiamy prawdziwy kod, zamiast sprawdzać wyrażenia regularne po wyglądzie.
const blok = source
  .slice(od, doKonca)
  .replace(/:\s*(?:SupplierKey|string|boolean|number)(?:\s*\|\s*null)?/g, "");
const { classifySlug } = new Function(`${blok}; return { classifySlug };`)();

const PRZYPADKI = [
  // dostawca, kategoria dostawcy, nazwa produktu, oczekiwany dział
  ["polzoo", "Karmy mokre", "Pedigree Mokra Karma Dla Szczeniąt Mix Smaków Kurczak Z Ryżem, Jagnięcina Z Ryżem, Drób Z Ryżem I Wołowina Z Ryżem W Galaretce 12x100g", "zwierzeta-pies-karma"],
  ["polzoo", "Oczka wodne - filtry", "TROPICAL Pond Sticks Mixed 4kg", "zwierzeta-akwarystyka-pokarm"],
  ["polzoo", "Oczka wodne - filtry", "TROPICAL Pond Pellet Mix 5kg", "zwierzeta-akwarystyka-pokarm"],
  ["polzoo", "Akwarystyka", "Eheim Pickup 60 2008 Filtr Wewnętrzny 4W", "zwierzeta-akwarystyka-filtry"],
  ["polzoo", "Akwarystyka", "AQUAEL Wkład Gąbkowy Super Maxi", "zwierzeta-akwarystyka-filtry"],
  ["polzoo", "Terrarystyka", "Carefresh Original podściółka (włókna celulozowe) dla gryzoni 14l", "zwierzeta-inne-zwierzeta-gryzonie"],
  ["polzoo", "Terrarystyka", "Trixie Poidło Dla Ptaków Wolnożyjących 1000ml", "zwierzeta-inne-zwierzeta-ptaki"],
  ["polzoo", "Terrarystyka", "REPTI PLANET Terrarium Szklane 30x30x45cm", "zwierzeta-inne-zwierzeta-terrarystyka"],
  ["polzoo", "Gryzonie", "BROS - granulat na myszy i szczury 1kg", "dom-i-ogrod-ogrod"],
  ["polzoo", "Hodowla", "Purina Koń rekreacyjny 25kg", "zwierzeta-gospodarskie"],
  ["polzoo", "Hodowla", "NOVITAL Automatyczne Poidło Dla Drobiu 30l", "zwierzeta-gospodarskie"],
  ["polzoo", "Karmy suche", "ACANA Homestead Harvest Cat 340g - sucha karma pełnoporcjowa dla kotów dorosłych", "zwierzeta-kot-karma"],
  ["eet", "Materiały eksploatacyjne", "CoreParts Zespół rolki pobierania papieru RM2-5741", "komputery-i-biuro-peryferia-drukarki"],
  ["eet", "Materiały eksploatacyjne", "CoreParts Zestaw opon do podawania papieru 24 szt 675K47673", "komputery-i-biuro-peryferia-drukarki"],
  ["eet", "Biuro", "Xerox Papier ksero A4 80g 500 arkuszy", "komputery-i-biuro-biuro-papier"],
  ["eet", "Sieci", "MicroConnect światłowód SC/APC-SC/APC 5m Simplex", "komputery-i-biuro-sieci-kable"],
];

for (const [dostawca, kategoria, nazwa, oczekiwany] of PRZYPADKI) {
  test(`${dostawca}: „${nazwa.slice(0, 48)}…” → ${oczekiwany}`, () => {
    assert.equal(classifySlug(dostawca, kategoria, nazwa), oczekiwany);
  });
}

test("nazwa produktu ma pierwszeństwo przed kategorią dostawcy", () => {
  // Ta sama nazwa, dwie różne kategorie dostawcy — wynik musi być ten sam.
  const a = classifySlug("polzoo", "Oczka wodne - filtry", "TROPICAL Pond Sticks Mixed 4kg");
  const b = classifySlug("polzoo", "Pokarmy", "TROPICAL Pond Sticks Mixed 4kg");
  assert.equal(a, b);
});
