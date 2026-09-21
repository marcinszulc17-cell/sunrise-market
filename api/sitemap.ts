// Dynamiczna mapa strony: strony statyczne, strony miast (/oze/<slug>) i aktywne ogłoszenia (search_offers_v2).
// vercel.json kieruje /sitemap.xml tutaj. Cache 1 h.
export const config = { runtime: "edge" };
import { CITIES, rpc, slugify } from "./_shared";

export default async function handler(req: Request): Promise<Response> {
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const u = (loc: string, freq: string, pri: string, mod?: string) => `<url><loc>${origin}${loc}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const stat = [u("/", "daily", "1.0"), u("/sklep", "daily", "0.9"), u("/szukaj", "daily", "0.8"), u("/szukaj?tryb=appointment", "weekly", "0.7"), u("/nieruchomosci", "daily", "0.8"), u("/motoryzacja", "daily", "0.8"), u("/miasto", "weekly", "0.9"), u("/praca", "daily", "0.8"), u("/noclegi", "weekly", "0.7"), u("/dla-partnerow", "monthly", "0.6"), u("/dla-obiektow", "monthly", "0.6"), u("/o-nas", "monthly", "0.5"), u("/pomoc", "monthly", "0.5"), u("/cennik", "monthly", "0.6"), u("/api-sprzedawcy", "monthly", "0.5"), u("/sprzedawca/dolacz", "monthly", "0.6"), u("/legal/regulamin.html", "yearly", "0.3"), u("/legal/prywatnosc.html", "yearly", "0.3"), u("/legal/kontakt.html", "yearly", "0.4")];
  const cities = CITIES.map((c) => u(`/miasto/${c.slug}`, "weekly", "0.8"));
  // Strony „temat + miasto" — powstają same z tego, co jest wystawione (market.mapa_lokalna).
  let lokalne: string[] = [];
  try { const rows = (await rpc("tematy_lokalne_mapa", {})) as any[]; lokalne = rows.map((r) => u(`/oferty/${r.temat}/${r.miasto}`, "daily", "0.8")); } catch { /* bez stron lokalnych */ }
  let offers: string[] = [];
  try { const rows = (await rpc("search_offers_v2", { p_query: null, p_category_slug: null, p_price_min: null, p_price_max: null, p_sort: "najnowsze", p_limit: 5000, p_filters: {} })) as any[]; offers = rows.map((o) => u(`/oferta/${slugify(o.title)}-${o.offer_id}`, "weekly", "0.7", o.created_at)); } catch { /* bez ofert */ }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...stat, ...cities, ...lokalne, ...offers].join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
