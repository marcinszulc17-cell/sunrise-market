// Strona ogłoszenia dla wyszukiwarek — i dla ludzi, ta sama.
//
// PROBLEM, KTÓRY TO ROZWIĄZUJE
// Sunrise Market jest aplikacją React: serwer odsyłał pusty <div id="root">, a całą treść
// dorysowywała przeglądarka. Google potrafi wykonać JavaScript, ale robi to w drugiej turze,
// z opóźnieniem liczonym w dniach i bez gwarancji. Bing, Seznam, DuckDuckGo i roboty AI
// nie robią tego wcale. Efekt: każde ogłoszenie miało w wynikach ten sam tytuł strony
// głównej albo nie miało go wcale.
//
// CO ROBI TA FUNKCJA
// Bierze zbudowany index.html i wstrzykuje do niego: tytuł, opis, canonical, OG,
// dane strukturalne (JSON-LD) i czytelny blok treści w #root. Człowiek widzi go przez
// ułamek sekundy, zanim React przejmie stronę; robot widzi pełną treść od razu.
// To NIE jest inne podawanie treści robotom (cloaking) — wszyscy dostają to samo.
//
// DANE STRUKTURALNE SĄ TU NAJWAŻNIEJSZE
// Product z ceną i dostępnością → wynik z ceną i gwiazdkami.
// JobPosting → oferta trafia do Google Jobs, czyli do modułu nad zwykłymi wynikami.
// Vehicle / RealEstateListing → karuzele branżowe.
// Bez tego jesteśmy zwykłym niebieskim linkiem wśród OLX-ów.
//
// AWARIA NIE MOŻE ZEPSUĆ STRONY: każdy błąd kończy się oddaniem czystego index.html.
export const config = { runtime: "edge" };
import { ANON, SUPABASE_URL, esc, slugify } from "./_shared";

function plain(s: unknown, max = 300) {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/[#*_`\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function zl(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n);
}

type Offer = {
  offer_id: string; title: string; description: string | null; price_gross: number; stock: number;
  category: string; category_slug: string; seller: string; image_url: string | null;
  avg_rating: number; review_count: number; attributes: Record<string, any> | null;
};

function danePlacowki(o: Offer, url: string, obraz: string) {
  const A = o.attributes ?? {};
  const slug = String(o.category_slug || "");
  const lokalizacja = typeof A.location === "string" ? A.location : "";
  const cena = Number(o.price_gross || 0);

  // Oferta pracy → JobPosting. To jedyny typ, który wchodzi do osobnego modułu Google
  // („Oferty pracy") wyświetlanego NAD zwykłymi wynikami. Dla nas to darmowy kanał
  // rekrutacyjny i najtańsza droga do ludzi szukających pracy w okolicy.
  if (slug.startsWith("ogloszenia-lokalne-praca")) {
    const od = Number(A.salary_from) || 0, doK = Number(A.salary_to) || 0;
    const okres = String(A.salary_period || "");
    const jednostka = okres.includes("godzin") ? "HOUR" : okres.includes("zlecen") ? "DAY" : "MONTH";
    return {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: o.title,
      description: plain(o.description, 2000) || o.title,
      datePosted: new Date().toISOString().slice(0, 10),
      employmentType: String(A.work_schedule || "").includes("Pełny") ? "FULL_TIME" : "PART_TIME",
      hiringOrganization: { "@type": "Organization", name: String(A.employer || o.seller || "Sunrise Market") },
      jobLocation: lokalizacja
        ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: lokalizacja, addressCountry: "PL" } }
        : undefined,
      jobLocationType: String(A.work_mode || "").toLowerCase().includes("zdaln") ? "TELECOMMUTE" : undefined,
      ...(od || doK ? {
        baseSalary: {
          "@type": "MonetaryAmount", currency: "PLN",
          value: { "@type": "QuantitativeValue", ...(od ? { minValue: od } : {}), ...(doK ? { maxValue: doK } : {}), unitText: jednostka },
        },
      } : {}),
      directApply: true,
      url,
    };
  }

  const wspolne = {
    "@context": "https://schema.org",
    name: o.title,
    description: plain(o.description, 1200) || `${o.category} · ${o.seller}`,
    image: obraz ? [obraz] : undefined,
    url,
    ...(o.review_count > 0 ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: o.avg_rating, reviewCount: o.review_count },
    } : {}),
    ...(cena > 0 ? {
      offers: {
        "@type": "Offer", price: cena, priceCurrency: "PLN", url,
        availability: (o.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
        seller: { "@type": "Organization", name: o.seller || "Sunrise Market" },
      },
    } : {}),
  };

  if (slug.includes("motoryzacja-samochody-osobowe")) {
    return {
      ...wspolne, "@type": "Car",
      brand: A.brand ? { "@type": "Brand", name: String(A.brand) } : undefined,
      model: A.model ? String(A.model) : undefined,
      vehicleModelDate: A.year ? String(A.year) : undefined,
      fuelType: A.fuel ? String(A.fuel) : undefined,
      mileageFromOdometer: A.mileage_km ? { "@type": "QuantitativeValue", value: Number(A.mileage_km), unitCode: "KMT" } : undefined,
    };
  }
  if (slug.startsWith("nieruchomosci-")) {
    return {
      ...wspolne, "@type": "Accommodation",
      floorSize: A.area_m2 ? { "@type": "QuantitativeValue", value: Number(A.area_m2), unitCode: "MTK" } : undefined,
      numberOfRooms: A.rooms ? Number(A.rooms) : undefined,
      address: lokalizacja ? { "@type": "PostalAddress", addressLocality: lokalizacja, addressCountry: "PL" } : undefined,
    };
  }
  if (slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-uslugi")) {
    return {
      ...wspolne, "@type": "Service",
      provider: { "@type": "Organization", name: o.seller || "Sunrise Market" },
      areaServed: lokalizacja ? { "@type": "Place", name: lokalizacja } : undefined,
    };
  }
  return { ...wspolne, "@type": "Product", ...(A.brand ? { brand: { "@type": "Brand", name: String(A.brand) } } : {}) };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;

  // Adres może być /produkt/<uuid> albo /oferta/<slug>-<uuid> — w obu identyfikator to ostatnie 36 znaków.
  const sciezka = decodeURIComponent(url.searchParams.get("id") || url.pathname);
  const m = sciezka.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const id = m ? m[0] : "";

  const czysty = async () => {
    const r = await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } });
    const html = await r.text();
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60" } });
  };

  if (!id) return czysty();

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_offer`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "Content-Profile": "market", "Accept-Profile": "market" },
      body: JSON.stringify({ p_id: id }),
    });
    const rows = await r.json().catch(() => []);
    const o: Offer | null = Array.isArray(rows) ? rows[0] : null;
    if (!o?.title) return czysty();

    const A = o.attributes ?? {};
    const lokalizacja = typeof A.location === "string" ? A.location : "";
    const cena = Number(o.price_gross || 0);
    // Adres kanoniczny zawiera nazwę oferty — to on trafia do wyników i do linków.
    const kanoniczny = `${origin}/oferta/${slugify(o.title)}-${o.offer_id}`;
    const obraz = o.image_url ? `${origin}/api/og-image?id=${o.offer_id}` : `${origin}/api/og-image`;

    const tytul = `${o.title}${cena > 0 ? ` — ${zl(cena)}` : ""}${lokalizacja ? ` · ${lokalizacja}` : ""} | Sunrise Market`;
    const opis = plain(o.description) ||
      `${o.category}${lokalizacja ? ` w ${lokalizacja}` : ""} od ${o.seller}. ${cena > 0 ? `Cena ${zl(cena)}. ` : ""}Kupuj z Ochroną Kupujących i 3% cashbacku w Sunrise Market.`;

    const okruszki = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Sunrise Market", item: origin },
        { "@type": "ListItem", position: 2, name: o.category, item: `${origin}/szukaj?kat=${encodeURIComponent(o.category_slug || "")}` },
        { "@type": "ListItem", position: 3, name: o.title, item: kanoniczny },
      ],
    };

    const glowa = `
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}" />
  <link rel="canonical" href="${esc(kanoniczny)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(tytul)}" />
  <meta property="og:description" content="${esc(opis)}" />
  <meta property="og:url" content="${esc(kanoniczny)}" />
  <meta property="og:image" content="${esc(obraz)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(tytul)}" />
  <meta name="twitter:description" content="${esc(opis)}" />
  <meta name="twitter:image" content="${esc(obraz)}" />
  <script type="application/ld+json">${JSON.stringify(danePlacowki(o, kanoniczny, obraz)).replace(/</g, "\\u003c")}</script>
  <script type="application/ld+json">${JSON.stringify(okruszki).replace(/</g, "\\u003c")}</script>`;

    // Treść widoczna dla robotów, które nie wykonują JavaScriptu. React podmieni ją
    // przy pierwszym renderze, więc człowiek nigdy nie zobaczy jej dłużej niż chwilę.
    const tresc = `<article style="max-width:760px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">
<h1>${esc(o.title)}</h1>
${cena > 0 ? `<p><strong>${esc(zl(cena))}</strong></p>` : ""}
<p>${esc(o.category)}${lokalizacja ? ` · ${esc(lokalizacja)}` : ""} · ${esc(o.seller)}</p>
${o.image_url ? `<img src="${esc(o.image_url)}" alt="${esc(o.title)}" width="640" />` : ""}
<p>${esc(plain(o.description, 1500))}</p>
<p><a href="${esc(kanoniczny)}">Zobacz ogłoszenie w Sunrise Market</a></p>
</article>`;

    const bazowy = await (await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } })).text();
    const html = bazowy
      // Usuwamy domyślne znaczniki strony głównej, żeby nie było dwóch tytułów i dwóch canonicali.
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
        // 10 minut w pamięci brzegowej, godzina „podaj stare, odśwież w tle" —
        // zmiana ceny pojawia się szybko, a baza nie dostaje ruchu z każdego wejścia.
        "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch {
    return czysty();
  }
}
