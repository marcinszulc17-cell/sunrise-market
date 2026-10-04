// Plik produktowy /feed.xml — dla Google Merchant Center, Bing Shopping i Ceneo.
//
// PO CO TO JEST
// Sitemapa mówi wyszukiwarce, że strona istnieje. Plik produktowy mówi jej, CO
// sprzedajemy: nazwę, cenę, dostępność, EAN. To różnica między niebieskim linkiem
// a kafelkiem ze zdjęciem i ceną w zakładce Zakupy — a bezpłatne listy zakupowe
// Google są dostępne dla każdego sklepu z poprawnym plikiem, bez wydawania złotówki
// na reklamy. 600 z 700 aktywnych ofert ma w atrybutach EAN, więc przechodzą.
//
// CZEGO TU NIE MA I DLACZEGO
// Oferty pracy, nieruchomości, usługi i noclegi są wycięte — Merchant Center
// przyjmuje towary, a za wrzucanie tam ogłoszeń innego rodzaju konto dostaje
// ostrzeżenie, które uderza w cały plik, nie w jedną pozycję.
//
// Dane idą przez market.feed_ofert(), które przepuszcza atrybuty przez
// market.atrybuty_publiczne(). Nigdy nie wystawiaj tu surowych `attributes`:
// siedzą w nich supplier_price_gross_pln i margin_percent, czyli marże hurtowe.
export const config = { runtime: "edge" };
import { SUPABASE_URL, ANON, esc, slugify } from "./_shared";

type Wiersz = {
  offer_id: string; title: string; description: string | null; price_gross: number; stock: number;
  category: string; category_slug: string; seller: string; image_url: string | null;
  attributes: Record<string, any> | null; created_at: string | null;
};

// Rodzaje ogłoszeń, których plik produktowy nie przyjmuje.
const POZA_PLIKIEM = ["ogloszenia-lokalne-praca", "ogloszenia-lokalne-szukam-pracy", "nieruchomosci-", "uslugi-", "ogloszenia-lokalne-uslugi", "noclegi"];

function czysty(s: unknown, max = 4800) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export default async function handler(req: Request): Promise<Response> {
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;

  let wiersze: Wiersz[] = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed_ofert`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "Content-Profile": "market", "Accept-Profile": "market" },
      body: JSON.stringify({ p_limit: 5000 }),
    });
    if (r.ok) wiersze = await r.json();
  } catch { /* pusty plik jest lepszy niż 500 — Merchant Center ponowi */ }

  // Koszty dostawy bierzemy z market.shipping_methods, a nie z palca. Google porównuje
  // deklarację z pliku z tym, co kupujący widzi w koszyku — rozjazd to ostrzeżenie
  // dla całego konta. Stawki są globalne (shipping_settings nie ma nadpisań per
  // sprzedawca), więc jeden zestaw opisuje wszystkie pozycje. Odbiór osobisty nie
  // jest dostawą i do pliku nie trafia.
  let wysylka: { nazwa: string; cena: number }[] = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/shipping_methods?select=name,price_gross,zone_code,lanes&active=eq.true&zone_code=eq.PL`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Accept-Profile": "market" },
    });
    if (r.ok) {
      const metody = (await r.json()) as any[];
      wysylka = metody
        .filter((m) => Number(m.price_gross) > 0 && (m.lanes ?? []).includes("ours"))
        .map((m) => ({ nazwa: String(m.name), cena: Number(m.price_gross) }))
        .sort((a, b) => a.cena - b.cena);
    }
  } catch { /* bez bloku shipping — Merchant Center weźmie stawki z ustawień konta */ }

  const blokWysylki = wysylka
    .map((w) => `<g:shipping><g:country>PL</g:country><g:service>${esc(w.nazwa)}</g:service><g:price>${w.cena.toFixed(2)} PLN</g:price></g:shipping>`)
    .join("");

  const pozycje: string[] = [];
  for (const o of wiersze) {
    const slug = String(o.category_slug || "");
    if (POZA_PLIKIEM.some((z) => slug.startsWith(z))) continue;

    const cena = Number(o.price_gross || 0);
    if (!(cena > 0)) continue;                 // pozycja bez ceny i tak zostanie odrzucona
    if (!o.image_url) continue;                // zdjęcie jest wymagane, bez wyjątków
    const opis = czysty(o.description) || `${o.category} — ${o.title}`;
    if (!opis) continue;

    const A = o.attributes ?? {};
    const ean = String(A.ean ?? "").replace(/\D/g, "");
    const gtin = [8, 12, 13, 14].includes(ean.length) ? ean : "";
    const sku = String(A.sku ?? "").trim();
    const marka = String(A.brand ?? A.make ?? "").trim();

    const stanTekst = String(A.condition ?? A.stan ?? "").toLowerCase();
    const stan = stanTekst.includes("now") ? "new"
      : /uzyw|używ|used/.test(stanTekst) || slug.startsWith("motoryzacja") ? "used"
      : "new";

    const link = `${origin}/oferta/${slugify(o.title)}-${o.offer_id}`;

    // Bez gtin i bez pary marka+mpn Google chce jawnej deklaracji, że identyfikatora
    // nie ma. Bez niej pozycja wisi w „oczekuje na weryfikację" i nigdy się nie pokazuje.
    const bezIdentyfikatora = !gtin && !(marka && sku);

    pozycje.push([
      "<item>",
      `<g:id>${esc(o.offer_id)}</g:id>`,
      `<g:title>${esc(czysty(o.title, 150))}</g:title>`,
      `<g:description>${esc(opis)}</g:description>`,
      `<g:link>${esc(link)}</g:link>`,
      `<g:image_link>${esc(o.image_url)}</g:image_link>`,
      `<g:availability>${(o.stock ?? 0) > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
      `<g:price>${cena.toFixed(2)} PLN</g:price>`,
      `<g:condition>${stan}</g:condition>`,
      marka ? `<g:brand>${esc(czysty(marka, 70))}</g:brand>` : "",
      gtin ? `<g:gtin>${esc(gtin)}</g:gtin>` : "",
      sku ? `<g:mpn>${esc(czysty(sku, 70))}</g:mpn>` : "",
      bezIdentyfikatora ? "<g:identifier_exists>no</g:identifier_exists>" : "",
      `<g:product_type>${esc(czysty(o.category, 100))}</g:product_type>`,
      blokWysylki,
      "</item>",
    ].filter(Boolean).join(""));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Sunrise Market</title>
<link>${origin}</link>
<description>Oferty Sunrise Market — marketplace ekosystemu Sunrise</description>
${pozycje.join("\n")}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Merchant Center pobiera plik raz na dobę, więc godzina w pamięci brzegowej
      // wystarczy, a baza nie dostaje pełnego przebiegu przy każdym pobraniu.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
