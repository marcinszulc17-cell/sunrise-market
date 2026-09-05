// Strona miasta /oze/<slug> dla robotów (Googlebot, Bing, podglądy linków) — SPA nie renderuje treści bez JS, więc
// vercel.json kieruje roboty tutaj. Zwracamy pełny HTML z tą samą treścią co CityLanding.tsx: nagłówek, opis,
// prawdziwe oferty (RPC city_offers), FAQ, linki do pozostałych miast, JSON-LD. Ludzie dostają aplikację React.
export const config = { runtime: "edge" };
import { CITIES, LOC, REGIONS, esc, rpc, zl } from "./_shared";

const inCity = (n: string) => `w ${LOC[n] ?? n}`;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const city = CITIES.find((c) => c.slug === slug);
  const links = CITIES.map((c) => `<li><a href="${origin}/oze/${c.slug}">${esc(c.name)}</a></li>`).join("");
  const head = (title: string, desc: string, path: string, ld: unknown) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Sunrise Market</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${origin}${path}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${origin}${path}"><meta property="og:image" content="${origin}/api/og-image"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(ld)}</script><style>body{font-family:system-ui,sans-serif;background:#0B0B0D;color:#F5F5F7;margin:0;padding:24px;line-height:1.6}a{color:#F5A623}h1{font-size:1.8rem}ul{padding-left:1.2rem}.g{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.c{border:1px solid #2a2a2e;border-radius:12px;padding:12px}.c b{color:#F5A623}</style></head><body><header><a href="${origin}/">Sunrise Market</a> › <a href="${origin}/szukaj?kat=oze-i-energia">OZE i Energia</a> › <a href="${origin}/oze">Obszar działania</a></header>`;

  if (!city) {
    const title = "Obszar działania Sunrise — OZE i energia w 200 km od Nowego Tomyśla";
    const desc = `Marki własne Sunrise działają w promieniu 200 km od Nowego Tomyśla: ${REGIONS.join(", ")}. Sprawdź oferty dla swojego miasta.`;
    const html = head(title, desc, "/oze", { "@context": "https://schema.org", "@type": "Organization", name: "Sunrise Market", url: origin, areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })) }) + `<main><h1>${esc(title)}</h1><p>${esc(desc)}</p><ul>${links}</ul></main></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  const title = `Fotowoltaika, pompy ciepła i magazyny energii ${inCity(city.name)}`;
  const desc = `Sunrise ${inCity(city.name)}: fotowoltaika, pompy ciepła, magazyny energii, klimatyzacja i serwis — montaż z dojazdem (${city.km} km od Nowego Tomyśla), cashback 3% i Ochrona Kupujących.`;
  const offers = (await rpc("city_offers", { p_slug: city.slug, p_limit: 24 }).catch(() => [])) as any[];
  const cards = offers.map((o) => `<a class="c" href="${origin}/produkt/${o.offer_id}"><b>${esc(zl(Number(o.price_gross)))}</b><br>${esc(o.title)}<br><small>${esc(o.category)} · 📍 ${esc(city.name)} · dojazd</small></a>`).join("");
  const faq = [[`Jak wygląda montaż ${inCity(city.name)}?`, `Po zakupie lub rezerwacji doboru kontaktuje się instalator Sunrise, ustala termin i przyjeżdża z Nowego Tomyśla (${city.km} km). Montaż i uruchomienie są w cenie ofert oznaczonych „montaż”.`], ["Czy dojazd jest płatny?", `Nie — w promieniu 200 km od Nowego Tomyśla dojazd jest wliczony. ${city.name} leży w tym zasięgu.`], ["Jak płacę i co z gwarancją?", "Płacisz przez Sunrise Market (portfel Sunrise Pay, karta, BLIK) z cashbackiem 3%. Pieniądze trafiają do wykonawcy dopiero po Twoim odbiorze — Ochrona Kupujących. Serwis i ochronę zapewnia Protect Plus."]];
  const ld = [{ "@context": "https://schema.org", "@type": "Service", name: title, provider: { "@type": "Organization", name: "Sunrise Market", url: origin }, areaServed: { "@type": "City", name: city.name }, serviceType: ["Fotowoltaika", "Pompy ciepła", "Magazyny energii", "Klimatyzacja"], url: `${origin}/oze/${city.slug}` }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
  const html = head(title, desc, `/oze/${city.slug}`, ld) + `<main><h1>${esc(title)}</h1><p>Marki własne Sunrise — instalacje fotowoltaiczne, pompy ciepła, magazyny energii, klimatyzacja i programy serwisowe Protect Plus — są dostępne ${esc(inCity(city.name))} i w okolicy. Działamy z Nowego Tomyśla w promieniu 200 km; ${esc(city.name)} leży ${city.km} km od nas, więc dobór, montaż i serwis realizujemy z dojazdem, bez pośredników.</p><h2>Oferty ${esc(inCity(city.name))}</h2><div class="g">${cards || "<p>Brak ofert w tej chwili.</p>"}</div><h2>Najczęstsze pytania</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}<h2>Inne miasta w zasięgu</h2><ul>${links}</ul><p><a href="${origin}/oze/${city.slug}">Otwórz w aplikacji Sunrise Market</a></p></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=1800" } });
}
