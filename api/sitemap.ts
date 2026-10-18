// Mapa strony jako INDEKS + mniejsze części (sitemap index, protokół sitemaps.org 0.9).
//
//   /sitemap.xml            → indeks: lista części poniżej
//   /sitemap-strony.xml     → strony statyczne + strony miast (/miasto/<slug>)
//   /sitemap-lokalne-1.xml … → strony „temat + miasto" (/oferty/<temat>/<miasto>, z market.mapa_lokalna)
//   /sitemap-oferty-1.xml …  → aktywne oferty (search_offers_v2)
//   (części numerowane mają po CZESC_MAX adresów)
//
// DLACZEGO PODZIAŁ (audyt SEO 2026-10-18): jedna mapa miała ~1350 adresów i ~230 KB.
// Generator oddawał ją w całości (koniec `</urlset>` był na miejscu), ale narzędzia audytowe
// i część crawlerów czytają tylko pierwsze ~64–70 KB odpowiedzi i raportowały „plik ucięty
// na ~490. wpisie". Dlatego części są małe (CZESC_MAX adresów ≈ 50–60 KB), a indeks spina całość.
// Każda część ma własny, zamknięty `<urlset>`; Content-Type zawsze application/xml.
//
// vercel.json kieruje tutaj /sitemap.xml i /sitemap-:czesc.xml (parametr ?czesc=). Cache 1 h.
export const config = { runtime: "edge" };
import { CITIES, esc, rpc, slugify } from "./_shared";

/** Maksimum adresów w jednej części. Protokół dopuszcza 50 000 / 50 MB; trzymamy się daleko
 *  poniżej, żeby każdy plik mieścił się w ~64 KB, które czytają najskromniejsze narzędzia. */
const CZESC_MAX = 300;
/** Ile ofert pobieramy z bazy do mapy. */
const OFERTY_LIMIT = 5000;

type Wpis = { loc: string; freq: string; pri: string; mod?: string };

const urlXml = (origin: string, w: Wpis) =>
  `<url><loc>${esc(origin + w.loc)}</loc>${w.mod ? `<lastmod>${esc(String(w.mod).slice(0, 10))}</lastmod>` : ""}<changefreq>${w.freq}</changefreq><priority>${w.pri}</priority></url>`;

const urlset = (origin: string, wpisy: Wpis[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${wpisy.map((w) => urlXml(origin, w)).join("\n")}\n</urlset>\n`;

const sitemapindex = (origin: string, czesci: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${czesci.map((c) => `<sitemap><loc>${esc(`${origin}/sitemap-${c}.xml`)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;

const odpowiedz = (xml: string, status = 200) =>
  new Response(xml, { status, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } });

/** Tylko kanoniczne adresy: bez parametrów zapytania, bez kotwic, bez duplikatów. */
function kanoniczne(wpisy: Wpis[]): Wpis[] {
  const widziane = new Set<string>();
  return wpisy.filter((w) => {
    if (!w.loc || /[?#]/.test(w.loc)) return false;
    if (widziane.has(w.loc)) return false;
    widziane.add(w.loc);
    return true;
  });
}

function strony(): Wpis[] {
  const s = (loc: string, freq: string, pri: string): Wpis => ({ loc, freq, pri });
  const stat = [
    s("/", "daily", "1.0"), s("/sklep", "daily", "0.9"), s("/szukaj", "daily", "0.8"), s("/nieruchomosci", "daily", "0.8"),
    s("/motoryzacja", "daily", "0.8"), s("/miasto", "weekly", "0.9"), s("/praca", "daily", "0.8"), s("/noclegi", "weekly", "0.7"),
    s("/dla-partnerow", "monthly", "0.6"), s("/dla-obiektow", "monthly", "0.6"), s("/o-nas", "monthly", "0.5"), s("/pomoc", "monthly", "0.5"),
    s("/cennik", "monthly", "0.6"), s("/api-sprzedawcy", "monthly", "0.5"), s("/sprzedawca/dolacz", "monthly", "0.6"),
    s("/legal/regulamin.html", "yearly", "0.3"), s("/legal/prywatnosc.html", "yearly", "0.3"), s("/legal/kontakt.html", "yearly", "0.4"),
  ];
  const miasta = CITIES.map((c) => s(`/miasto/${c.slug}`, "weekly", "0.8"));
  return kanoniczne([...stat, ...miasta]);
}

/**
 * Strony „temat + miasto". Źródłem jest market.mapa_lokalna (odświeżana co godzinę): wiersz
 * istnieje tylko tam, gdzie w danym temacie są oferty obsługujące miasto. Slug tematu = slug
 * kategorii Marketu, więc `oze-i-energia` (korzeń działu) i `oze-i-energia-fotowoltaika`,
 * `-pompy-ciepla` itd. (podkategorie) to RÓŻNE strony z różnymi listami ofert — nie duplikaty
 * jednego sluga. Każda ma własny `<link rel="canonical">` na siebie (api/temat.ts).
 * Odrzucamy tylko wiersze z zerem ofert i slugi spoza wzorca adresu.
 */
async function lokalne(): Promise<Wpis[]> {
  try {
    const rows = (await rpc("tematy_lokalne_mapa", {})) as { temat?: string; miasto?: string; ofert?: number }[];
    if (!Array.isArray(rows)) return [];
    return kanoniczne(rows
      .filter((r) => r && typeof r.temat === "string" && typeof r.miasto === "string"
        && /^[a-z0-9-]{2,80}$/.test(r.temat) && /^[a-z0-9-]{2,60}$/.test(r.miasto)
        && (r.ofert == null || Number(r.ofert) > 0))
      .map((r) => ({ loc: `/oferty/${r.temat}/${r.miasto}`, freq: "daily", pri: "0.8" })));
  } catch { return []; }
}

async function oferty(): Promise<Wpis[]> {
  try {
    const rows = (await rpc("search_offers_v2", { p_query: null, p_category_slug: null, p_price_min: null, p_price_max: null, p_sort: "najnowsze", p_limit: OFERTY_LIMIT, p_filters: {} })) as { offer_id?: string; title?: string; created_at?: string }[];
    if (!Array.isArray(rows)) return [];
    return kanoniczne(rows
      .filter((o) => o && typeof o.offer_id === "string" && o.offer_id)
      .map((o) => ({ loc: `/oferta/${slugify(o.title)}-${o.offer_id}`, freq: "weekly", pri: "0.7", mod: o.created_at })));
  } catch { return []; }
}

const liczbaCzesci = (n: number) => Math.max(1, Math.ceil(n / CZESC_MAX));
const nazwyCzesci = (prefiks: string, n: number) => Array.from({ length: liczbaCzesci(n) }, (_, i) => `${prefiks}-${i + 1}`);

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const czesc = (url.searchParams.get("czesc") || "").toLowerCase();

  if (!czesc) {
    // Indeks. Liczbę części liczymy z faktycznych list, żeby indeks nigdy nie wskazywał
    // pustego pliku ani nie pominął ostatniej porcji.
    const [l, o] = await Promise.all([lokalne(), oferty()]);
    return odpowiedz(sitemapindex(origin, ["strony", ...nazwyCzesci("lokalne", l.length), ...nazwyCzesci("oferty", o.length)]));
  }
  if (czesc === "strony") return odpowiedz(urlset(origin, strony()));
  const m = /^(lokalne|oferty)-(\d{1,3})$/.exec(czesc);
  if (m) {
    const nr = Number(m[2]);
    const lista = m[1] === "lokalne" ? await lokalne() : await oferty();
    if (nr < 1 || nr > liczbaCzesci(lista.length)) return odpowiedz(urlset(origin, []), 404);
    return odpowiedz(urlset(origin, lista.slice((nr - 1) * CZESC_MAX, nr * CZESC_MAX)));
  }
  return odpowiedz(urlset(origin, []), 404);
}
