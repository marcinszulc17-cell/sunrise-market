// Strona miasta /oze/<slug> dla robotów (Googlebot, Bing, podglądy linków) — SPA nie renderuje treści bez JS, więc
// vercel.json kieruje roboty tutaj. Zwracamy pełny HTML z tą samą treścią co CityLanding.tsx: nagłówek, opis,
// prawdziwe oferty (RPC city_offers), FAQ, linki do pozostałych miast, JSON-LD. Ludzie dostają aplikację React.
export const config = { runtime: "edge" };
import { CITIES, LOC, REGIONS, RADIUS_KM, esc, rpc, zl } from "./_shared";

const inCity = (n: string) => `w ${LOC[n] ?? n}`;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const city = CITIES.find((c) => c.slug === slug);
  const links = CITIES.map((c) => `<li><a href="${origin}/miasto/${c.slug}">${esc(c.name)}</a></li>`).join("");
  const head = (title: string, desc: string, path: string, ld: unknown) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Sunrise Market</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${origin}${path}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${origin}${path}"><meta property="og:image" content="${origin}/api/og-image"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(ld)}</script><style>body{font-family:system-ui,sans-serif;background:#0B0B0D;color:#F5F5F7;margin:0;padding:24px;line-height:1.6}a{color:#F5A623}h1{font-size:1.8rem}ul{padding-left:1.2rem}.g{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.c{border:1px solid #2a2a2e;border-radius:12px;padding:12px}.c b{color:#F5A623}</style></head><body><header><a href="${origin}/">Sunrise Market</a> › <a href="${origin}/szukaj?kat=oze-i-energia">OZE i Energia</a> › <a href="${origin}/oze">Obszar działania</a></header>`;

  if (!city) {
    const title = "Sunrise Market w Twoim mieście — ogłoszenia i usługi w całej Polsce";
    const desc = `Sunrise Market to marketplace dla wszystkich — lokalnych sprzedawców, firm i marek własnych Sunrise (OZE z dojazdem do ${RADIUS_KM} km). Wybierz swoje miasto.`;
    const html = head(title, desc, "/miasto", { "@context": "https://schema.org", "@type": "Organization", name: "Sunrise Market", url: origin, areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })) }) + `<main><h1>${esc(title)}</h1><p>${esc(desc)}</p><ul>${links}</ul></main></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  const title = `Sunrise Market ${inCity(city.name)} — ogłoszenia, usługi, nieruchomości, OZE`;
  const desc = `Kupuj i sprzedawaj ${inCity(city.name)}: produkty, usługi z terminarzem, nieruchomości, motoryzacja oraz fotowoltaika i pompy ciepła z montażem. Cashback 3% i Ochrona Kupujących przy każdej transakcji.`;
  const offers = (await rpc("city_offers", { p_slug: city.slug, p_limit: 24 }).catch(() => [])) as any[];
  const cards = offers.map((o) => `<a class="c" href="${origin}/produkt/${o.offer_id}"><b>${esc(zl(Number(o.price_gross)))}</b><br>${esc(o.title)}<br><small>${esc(o.category)} · 📍 ${esc(o.location && !/nowy tomy/i.test(o.location) ? o.location : city.name + " · dojazd")}</small></a>`).join("");
  const faq = [[`Kto sprzedaje ${inCity(city.name)}?`, "Lokalni sprzedawcy prywatni, firmy (Partnerzy Handlowi) i marki własne Sunrise. Każdy sprzedawca akceptuje regulamin, a opinie pochodzą wyłącznie od klientów po zakupie."], [`Jak wygląda montaż OZE ${inCity(city.name)}?`, `Po zakupie lub rezerwacji doboru kontaktuje się instalator Sunrise i przyjeżdża z Nowego Tomyśla (${city.km} km). W promieniu ${RADIUS_KM} km dojazd jest w cenie.`], ["Jak płacę i co, jeśli coś pójdzie nie tak?", "Płacisz przez Sunrise Market (portfel Sunrise Pay, karta, BLIK) z cashbackiem 3%. Pieniądze trafiają do sprzedawcy dopiero po Twoim odbiorze — Ochrona Kupujących; spór rozstrzyga operator."]];
  const ld = [{ "@context": "https://schema.org", "@type": "WebPage", name: title, description: desc, url: `${origin}/miasto/${city.slug}`, about: { "@type": "City", name: city.name }, publisher: { "@type": "Organization", name: "Sunrise Market", url: origin } }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
  const html = head(title, desc, `/miasto/${city.slug}`, ld) + `<main><h1>${esc(title)}</h1><p>Sunrise Market to jedno miejsce dla wszystkich ${esc(inCity(city.name))}: produkty od lokalnych sprzedawców i firm, usługi z terminarzem, nieruchomości, motoryzacja, a także fotowoltaika, pompy ciepła i magazyny energii marek własnych Sunrise z montażem i dojazdem (${esc(city.name)} leży ${city.km} km od Nowego Tomyśla). Każda transakcja idzie przez Sunrise — z cashbackiem 3% i Ochroną Kupujących.</p><p><a href="${origin}/sprzedawca/wystaw">Sprzedajesz ${esc(inCity(city.name))}? Dodaj ogłoszenie</a></p><h2>Oferty ${esc(inCity(city.name))}</h2><div class="g">${cards || "<p>Brak ofert w tej chwili.</p>"}</div><h2>Najczęstsze pytania</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}<h2>Inne miasta</h2><ul>${links}</ul><p><a href="${origin}/miasto/${city.slug}">Otwórz w aplikacji Sunrise Market</a></p></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=1800" } });
}
