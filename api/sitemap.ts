// Dynamiczna mapa strony: strony statyczne, strony miast (/oze/<slug>) i aktywne ogłoszenia (search_offers_v2).
// vercel.json kieruje /sitemap.xml tutaj. Cache 1 h.
export const config = { runtime: "edge" };
import { CITIES, rpc } from "./_shared";

export default async function handler(req: Request): Promise<Response> {
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const u = (loc: string, freq: string, pri: string, mod?: string) => `<url><loc>${origin}${loc}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const stat = [u("/", "daily", "1.0"), u("/sklep", "daily", "0.9"), u("/szukaj", "daily", "0.8"), u("/szukaj?tryb=appointment", "weekly", "0.7"), u("/nieruchomosci", "daily", "0.8"), u("/motoryzacja", "daily", "0.8"), u("/oze", "weekly", "0.9"), u("/o-nas", "monthly", "0.5"), u("/pomoc", "monthly", "0.5"), u("/cennik", "monthly", "0.6"), u("/sprzedawca/dolacz", "monthly", "0.6"), u("/legal/regulamin.html", "yearly", "0.3"), u("/legal/prywatnosc.html", "yearly", "0.3"), u("/legal/kontakt.html", "yearly", "0.4")];
  const cities = CITIES.map((c) => u(`/oze/${c.slug}`, "weekly", "0.8"));
  let offers: string[] = [];
  try { const rows = (await rpc("search_offers_v2", { p_query: null, p_category_slug: null, p_price_min: null, p_price_max: null, p_sort: "najnowsze", p_limit: 1000, p_filters: {} })) as any[]; offers = rows.map((o) => u(`/produkt/${o.offer_id}`, "weekly", "0.7", o.created_at)); } catch { /* bez ofert */ }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...stat, ...cities, ...offers].join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
