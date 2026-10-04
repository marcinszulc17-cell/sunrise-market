// Strona główna dla robotów — ta sama, którą widzi człowiek.
//
// CO TO NAPRAWIA (znalezione w Search Console 2026-10-04)
// 776 adresów poza indeksem, z czego 767 w stanie „wykryta — obecnie
// niezindeksowana". To nie jest blokada techniczna: Google zna te adresy
// z sitemapy, tylko nie uznał ich za warte zaindeksowania. Inspektor adresu
// dla /miasto pokazał dlaczego — „Strona odsyłająca: nie wykryto".
//
// Linki do miast i kategorii istnieją w Home.tsx, ale rysuje je React. Serwer
// oddawał pod adresem `/` pusty <div id="root">, więc graf linków całego serwisu
// zaczynał się dla Googlebota od zera: sitemapa z tysiącem adresów bez ani jednej
// strony, która by na nie wskazywała. Tak wygląda witryna, w którą nie warto
// inwestować budżetu indeksowania.
//
// Wstrzykujemy więc do zbudowanego index.html to, co i tak jest na stronie:
// kategorie, miasta i najnowsze ogłoszenia — jako zwykłe <a href>. React
// podmienia tę treść przy pierwszym renderze, więc człowiek widzi ją przez
// ułamek sekundy. Żadnej treści tylko dla robotów.
//
// AWARIA NIE MOŻE ZGASIĆ STRONY GŁÓWNEJ: każdy błąd kończy się oddaniem
// czystego index.html, dokładnie tak jak w api/oferta.ts.
export const config = { runtime: "edge" };
import { CITIES, esc, rpc, slugify, zl } from "./_shared";

const DZIALY: [string, string][] = [
  ["/sklep", "Sklep — produkty i usługi"],
  ["/noclegi", "Noclegi i rezerwacje"],
  ["/nieruchomosci", "Nieruchomości"],
  ["/motoryzacja", "Motoryzacja"],
  ["/praca", "Oferty pracy w okolicy"],
  ["/miasto", "Sunrise Market w Twoim mieście"],
  ["/cennik", "Cennik dla sprzedawców"],
  ["/sprzedawca/dolacz", "Zostań sprzedawcą"],
  ["/dla-obiektow", "Dla obiektów noclegowych"],
  ["/dla-partnerow", "Dla partnerów"],
  ["/pomoc", "Pomoc"],
  ["/o-nas", "O nas"],
];

export default async function handler(req: Request): Promise<Response> {
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;

  const czysty = async () => {
    const r = await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } });
    return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60" } });
  };

  try {
    let oferty: any[] = [];
    try {
      const r = (await rpc("search_offers_v2", {
        p_query: null, p_category_slug: null, p_price_min: null, p_price_max: null,
        p_sort: "najnowsze", p_limit: 60, p_filters: {},
      })) as any[];
      oferty = Array.isArray(r) ? r.slice(0, 60) : [];
    } catch { /* bez listy ogłoszeń — reszta linków wystarczy */ }

    const dzialy = DZIALY.map(([h, n]) => `<li><a href="${origin}${h}">${esc(n)}</a></li>`).join("");
    const miasta = CITIES.map((c) => `<li><a href="${origin}/miasto/${c.slug}">Sunrise Market ${esc(c.name)}</a></li>`).join("");
    const ogloszenia = oferty.map((o) =>
      `<li><a href="${origin}/oferta/${slugify(o.title)}-${o.offer_id}">${esc(o.title)}</a>${
        Number(o.price_gross) > 0 ? ` — <strong>${esc(zl(Number(o.price_gross)))}</strong>` : ""
      } <small>${esc(o.category ?? "")}</small></li>`).join("");

    const tresc = `<main style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">
<h1>Sunrise Market — marketplace ekosystemu Sunrise</h1>
<p>Produkty i usługi od zweryfikowanych sprzedawców, noclegi z rezerwacją, nieruchomości, motoryzacja i ogłoszenia lokalne. Płatność portfelem Sunrise Pay albo kartą, cashback 3% i Ochrona Kupujących przy każdej transakcji — sprzedawca dostaje pieniądze dopiero po Twoim odbiorze.</p>
<h2>Działy</h2>
<ul>${dzialy}</ul>
${ogloszenia ? `<h2>Najnowsze ogłoszenia</h2>\n<ul>${ogloszenia}</ul>` : ""}
<h2>Miasta</h2>
<ul>${miasta}</ul>
</main>`;

    const bazowy = await (await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } })).text();
    const html = bazowy.replace('<div id="root"></div>', `<div id="root">${tresc}</div>`);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Strona główna jest najczęściej odwiedzana — trzymamy ją w pamięci brzegowej
        // 15 minut i podajemy starą wersję przez dobę, póki odświeża się w tle.
        "cache-control": "public, max-age=0, s-maxage=900, stale-while-revalidate=86400",
      },
    });
  } catch {
    return czysty();
  }
}
