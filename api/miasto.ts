// Strona miasta /miasto/<slug> — ta sama dla ludzi i dla robotów.
//
// CO BYŁO ZEPSUTE (znalezione 2026-10-04)
// Ten plik istniał i był kompletny, ale vercel.json nie miał dla niego żadnego
// przepisania — adresy /miasto/* wpadały w regułę „wszystko inne → index.html".
// Skutek: 79 adresów miast siedziało w sitemapie, a robot dostawał pod każdym z nich
// pusty <div id="root"> i tytuł strony głównej. Osiemdziesiąt adresów zgłoszonych
// Google jako duplikaty tej samej pustej strony to nie jest neutralne zero.
//
// Poprzednia wersja oddawała własny, samodzielny HTML (bez bundla Reacta), bo kiedyś
// kierowały tu wyłącznie roboty rozpoznawane po User-Agencie. Takiego rozdziału już nie
// ma i nie wraca: podawanie robotom innej treści niż ludziom to cloaking. Dlatego teraz,
// dokładnie jak api/oferta.ts, wstrzykujemy znaczniki i treść do zbudowanego index.html —
// człowiek widzi ją przez ułamek sekundy, zanim React przejmie stronę.
export const config = { runtime: "edge" };
import { CITIES, LOC, esc, rpc, zl } from "./_shared";

const wMiescie = (n: string) => `w ${LOC[n] ?? n}`;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;

  // Adres może przyjść jako ?slug=poznan (przepisanie) albo wprost jako /miasto/poznan.
  const slug = (url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop() || "")
    .toLowerCase().replace(/[^a-z0-9-]/g, "");
  const city = CITIES.find((c) => c.slug === slug) ?? null;

  const czysty = async () => {
    const r = await fetch(`${origin}/index.html`, { headers: { "x-prerender": "1" } });
    return new Response(await r.text(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60" } });
  };

  try {
    const sciezka = city ? `/miasto/${city.slug}` : "/miasto";
    const kanoniczny = `${origin}${sciezka}`;
    const obraz = `${origin}/api/og-image`;
    const linki = CITIES.map((c) => `<li><a href="${origin}/miasto/${c.slug}">${esc(c.name)}</a></li>`).join("");

    let tytul: string, opis: string, ld: unknown[], tresc: string;

    if (!city) {
      tytul = "Sunrise Market w Twoim mieście — ogłoszenia i usługi w całej Polsce | Sunrise Market";
      opis = "Marketplace dla lokalnych sprzedawców, firm i marek własnych Sunrise — OZE z montażem w całej Polsce. Wybierz swoje miasto.";
      ld = [{
        "@context": "https://schema.org", "@type": "CollectionPage", name: tytul, description: opis, url: kanoniczny,
        publisher: { "@type": "Organization", name: "Sunrise Market", url: origin },
        about: CITIES.map((c) => ({ "@type": "City", name: c.name })),
      }];
      tresc = `<article style="max-width:760px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">
<h1>Sunrise Market w Twoim mieście</h1>
<p>${esc(opis)}</p>
<ul>${linki}</ul>
</article>`;
    } else {
      tytul = `Sunrise Market ${wMiescie(city.name)} — ogłoszenia, usługi, nieruchomości, OZE | Sunrise Market`;
      opis = `Kupuj i sprzedawaj ${wMiescie(city.name)}: produkty, usługi z terminarzem, nieruchomości, motoryzacja oraz fotowoltaika i pompy ciepła z montażem. Cashback 3% i Ochrona Kupujących przy każdej transakcji.`;

      const oferty = (await rpc("city_offers", { p_slug: city.slug, p_limit: 24 }).catch(() => [])) as any[];
      const karty = (oferty ?? []).map((o) =>
        `<li><a href="${origin}/produkt/${o.offer_id}"><strong>${esc(zl(Number(o.price_gross)))}</strong> — ${esc(o.title)}</a> <small>${esc(o.category)}</small></li>`).join("");

      const faq: [string, string][] = [
        [`Kto sprzedaje ${wMiescie(city.name)}?`, "Lokalni sprzedawcy prywatni, firmy (Partnerzy Handlowi) i marki własne Sunrise. Każdy sprzedawca akceptuje regulamin, a opinie pochodzą wyłącznie od klientów po zakupie."],
        [`Jak wygląda montaż OZE ${wMiescie(city.name)}?`, `Po zakupie lub rezerwacji doboru kontaktuje się instalator Sunrise i przyjeżdża z Nowego Tomyśla (${city.km} km). Montujemy w całej Polsce — dojazd jest w cenie.`],
        ["Jak płacę i co, jeśli coś pójdzie nie tak?", "Płacisz przez Sunrise Market (portfel Sunrise Pay lub karta) z cashbackiem 3%. Pieniądze trafiają do sprzedawcy dopiero po Twoim odbiorze — Ochrona Kupujących; spór rozstrzyga operator."],
      ];

      ld = [
        {
          "@context": "https://schema.org", "@type": "CollectionPage", name: tytul, description: opis, url: kanoniczny,
          about: { "@type": "City", name: city.name, address: { "@type": "PostalAddress", addressLocality: city.name, addressRegion: city.region, addressCountry: "PL" } },
          publisher: { "@type": "Organization", name: "Sunrise Market", url: origin },
        },
        {
          "@context": "https://schema.org", "@type": "FAQPage",
          mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        },
        {
          "@context": "https://schema.org", "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Sunrise Market", item: origin },
            { "@type": "ListItem", position: 2, name: "Miasta", item: `${origin}/miasto` },
            { "@type": "ListItem", position: 3, name: city.name, item: kanoniczny },
          ],
        },
      ];

      tresc = `<article style="max-width:760px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">
<h1>Sunrise Market ${esc(wMiescie(city.name))}</h1>
<p>Sunrise Market to jedno miejsce dla wszystkich ${esc(wMiescie(city.name))}: produkty od lokalnych sprzedawców i firm, usługi z terminarzem, nieruchomości, motoryzacja, a także fotowoltaika, pompy ciepła i magazyny energii marek własnych Sunrise z montażem i dojazdem (${esc(city.name)} leży ${city.km} km od Nowego Tomyśla). Każda transakcja idzie przez Sunrise — z cashbackiem 3% i Ochroną Kupujących.</p>
<p><a href="${origin}/sprzedawca/wystaw">Sprzedajesz ${esc(wMiescie(city.name))}? Dodaj ogłoszenie</a></p>
<h2>Oferty ${esc(wMiescie(city.name))}</h2>
<ul>${karty || "<li>Brak ofert w tej chwili.</li>"}</ul>
<h2>Najczęstsze pytania</h2>
${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}
<h2>Inne miasta</h2>
<ul>${linki}</ul>
</article>`;
    }

    const glowa = `
  <title>${esc(tytul)}</title>
  <meta name="description" content="${esc(opis)}" />
  <link rel="canonical" href="${esc(kanoniczny)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(tytul)}" />
  <meta property="og:description" content="${esc(opis)}" />
  <meta property="og:url" content="${esc(kanoniczny)}" />
  <meta property="og:image" content="${esc(obraz)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(tytul)}" />
  <meta name="twitter:description" content="${esc(opis)}" />
${ld.map((x) => `  <script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}`;

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
