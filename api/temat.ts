// Strona „temat + miasto": /oferty/<temat>/<miasto> — np. /oferty/fotowoltaika/wolsztyn.
//
// PO CO TO JEST
// Nikt nie wpisuje w Google „Sunrise Market". Wpisuje „fotowoltaika wolsztyn", „pompa
// ciepła leszno", „karma dla psa poznań". Google pokazuje stronę, która ma tę frazę
// w tytule, w nagłówku i w treści — a takiej strony nie mieliśmy: strona miasta mówi
// „Sunrise Market w Wolsztynie", a karta oferty mówi o jednym produkcie.
//
// SKĄD SIĘ BIORĄ TEMATY
// Z kategorii Marketu, automatycznie (market.mapa_lokalna, odświeżana co godzinę).
// Nowa kategoria w ofercie = nowe strony w każdym mieście, bez dotykania kodu.
// Strona powstaje tylko tam, gdzie naprawdę są oferty obsługujące to miasto — pusta
// strona to dla Google śmieć, a dla człowieka rozczarowanie.
//
// Treść dostają wszyscy tak samo: robot czyta ją od razu, człowiek widzi ją przez ułamek
// sekundy, zanim React przejmie stronę. Każdy błąd kończy się oddaniem czystego index.html.
export const config = { runtime: "edge" };
import { ANON, SUPABASE_URL, LOC, esc, slugify, zl } from "./_shared";

const inCity = (n: string) => `w ${LOC[n] ?? n}`;

async function rpcMarket(name: string, body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "Content-Profile": "market", "Accept-Profile": "market" },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}

type Temat = { temat: string; nazwa: string; opis: string; miasto: string; miasto_nazwa: string; region: string; ofert: number };
type Oferta = { offer_id: string; title: string; price_gross: number; category: string; image_url: string | null; location: string | null };
type Sasiad = { rodzaj: string; slug: string; nazwa: string; ofert: number };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const czysty = async (kod = 200) => {
    const html = await (await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } })).text();
    return new Response(html, { status: kod, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60" } });
  };

  const czesci = url.pathname.split("/").filter(Boolean);
  const temat = (url.searchParams.get("temat") || czesci[1] || "").toLowerCase();
  const miasto = (url.searchParams.get("miasto") || czesci[2] || "").toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(temat) || !/^[a-z0-9-]{2,60}$/.test(miasto)) return czysty();

  try {
    const [naglowek] = (await rpcMarket("temat_lokalny", { p_temat: temat, p_miasto: miasto })) as Temat[];
    // Brak wiersza = nie mamy w tym mieście pokrycia w tym temacie. Nie udajemy, że mamy:
    // taka strona nie istnieje i Google ma się o tym dowiedzieć wprost.
    if (!naglowek?.temat) return czysty(404);

    const [oferty, sasiedzi] = await Promise.all([
      rpcMarket("oferty_tematyczne", { p_temat: temat, p_miasto: miasto, p_limit: 30 }) as Promise<Oferta[]>,
      rpcMarket("temat_sasiedzi", { p_temat: temat, p_miasto: miasto }) as Promise<Sasiad[]>,
    ]);

    const m = naglowek.miasto_nazwa;
    const kanoniczny = `${origin}/oferty/${temat}/${miasto}`;
    const tytul = `${naglowek.nazwa} ${m} — oferty z okolicy | Sunrise Market`;
    const opis = `${naglowek.nazwa} ${inCity(m)}: ${naglowek.ofert} ${naglowek.ofert === 1 ? "oferta" : naglowek.ofert < 5 ? "oferty" : "ofert"} od sprzedawców, którzy obsługują ${m} i okolice. ${naglowek.opis}`.slice(0, 300);

    const lista = (oferty || []).slice(0, 30);
    const karty = lista.map((o) => {
      const adres = `${origin}/oferta/${slugify(o.title)}-${o.offer_id}`;
      const cena = Number(o.price_gross || 0);
      return `<li><a href="${esc(adres)}">${esc(o.title)}</a>${cena > 0 ? ` — <strong>${esc(zl(cena))}</strong>` : ""}<br><small>${esc(o.category)}${o.location ? ` · ${esc(o.location)}` : ` · obsługuje ${esc(m)}`}</small></li>`;
    }).join("");

    const tematyTu = (sasiedzi || []).filter((s) => s.rodzaj === "temat");
    const miastaTemat = (sasiedzi || []).filter((s) => s.rodzaj === "miasto");
    const linki = (tytulSekcji: string, xs: Sasiad[], adres: (s: Sasiad) => string) =>
      xs.length ? `<h2>${esc(tytulSekcji)}</h2><ul>${xs.map((s) => `<li><a href="${esc(adres(s))}">${esc(s.nazwa)}</a> <small>(${s.ofert})</small></li>`).join("")}</ul>` : "";

    const ld = [
      {
        "@context": "https://schema.org", "@type": "CollectionPage",
        name: tytul, description: opis, url: kanoniczny,
        about: { "@type": "Thing", name: `${naglowek.nazwa} ${m}` },
        spatialCoverage: { "@type": "City", name: m, containedInPlace: { "@type": "AdministrativeArea", name: naglowek.region } },
        publisher: { "@type": "Organization", name: "Sunrise Market", url: origin },
        mainEntity: {
          "@type": "ItemList", numberOfItems: lista.length,
          itemListElement: lista.map((o, i) => ({
            "@type": "ListItem", position: i + 1, name: o.title,
            url: `${origin}/oferta/${slugify(o.title)}-${o.offer_id}`,
          })),
        },
      },
      {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Sunrise Market", item: origin },
          { "@type": "ListItem", position: 2, name: m, item: `${origin}/miasto/${miasto}` },
          { "@type": "ListItem", position: 3, name: `${naglowek.nazwa} ${m}`, item: kanoniczny },
        ],
      },
    ];

    const glowa = `
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}" />
  <link rel="canonical" href="${esc(kanoniczny)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(tytul)}" />
  <meta property="og:description" content="${esc(opis)}" />
  <meta property="og:url" content="${esc(kanoniczny)}" />
  <meta property="og:image" content="${origin}/api/og-image" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(tytul)}" />
  <meta name="twitter:description" content="${esc(opis)}" />
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;

    const tresc = `<main style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">
<nav><a href="${origin}/">Sunrise Market</a> › <a href="${origin}/miasto/${esc(miasto)}">${esc(m)}</a> › ${esc(naglowek.nazwa)}</nav>
<h1>${esc(naglowek.nazwa)} ${esc(m)}</h1>
<p>${esc(opis)}</p>
<p><a href="${origin}/sprzedawca/wystaw">Sprzedajesz ${esc(inCity(m))}? Dodaj ogłoszenie — pierwszy rok bez opłat.</a></p>
<h2>Oferty: ${esc(naglowek.nazwa)} ${esc(inCity(m))}</h2>
<ul>${karty || "<li>W tej chwili nie mamy tu ofert.</li>"}</ul>
${linki(`Czego jeszcze szukasz ${inCity(m)}?`, tematyTu, (s) => `${origin}/oferty/${s.slug}/${miasto}`)}
${linki(`${naglowek.nazwa} w innych miastach`, miastaTemat, (s) => `${origin}/oferty/${temat}/${s.slug}`)}
<p><a href="${origin}/miasto/${esc(miasto)}">Wszystko, co mamy ${esc(inCity(m))}</a></p>
</main>`;

    const bazowy = await (await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } })).text();
    const html = bazowy
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta name="description"[^>]*>/i, "")
      .replace(/<link rel="canonical"[^>]*>/i, "")
      .replace(/<meta name="robots"[^>]*>/i, "")
      .replace(/<meta property="og:(type|title|description|url)"[^>]*>/gi, "")
      .replace(/<meta name="twitter:(card|title|description)"[^>]*>/gi, "")
      .replace("</head>", `${glowa}\n</head>`)
      .replace('<div id="root"></div>', `<div id="root">${tresc}</div>`);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return czysty();
  }
}
