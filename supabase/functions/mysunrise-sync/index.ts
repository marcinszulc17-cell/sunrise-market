// mysunrise-sync — automatyczny sync produktów Sunrise Energy (MySunrise.shop_products)
// do market.offers. Każdy AKTYWNY produkt z MySunrise trafia do Market na tych samych
// zasadach: cena 1:1, pełny MLM (mlm_full), marka własna. Wołane przez pg_cron (co 15 min).
// Zabezpieczenie: nagłówek x-sync-secret.
// 2026-08: dodany krok dezaktywacji — produkt zdjęty w MySunrise znika też z Marketu.
// 2026-09-05: oferta UKRYTA ręcznie w Market (status 'paused') zostaje ukryta — sync nie
//   przywraca jej statusu 'active'. Opis z MySunrise (pełny, z sunriserewards.pl) nadpisuje opis w Market.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MS_URL = "https://lvmrhgpxhqvfuoftblky.supabase.co";
const MS_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2bXJoZ3B4aHF2ZnVvZnRibGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDgzMDgsImV4cCI6MjA5NzE4NDMwOH0.tqxTejWN-sSn43qQkVKSVAXBxUb6KbQRRq2wQIhunfw";
const SYNC_SECRET = Deno.env.get("MYSUNRISE_SYNC_SECRET") ?? "sunrise-ms-sync-2026"; // współdzielony sekret dla pg_cron

// Statusy ustawione ręcznie przez sprzedawcę/operatora — sync ich nie nadpisuje.
const STATUSY_RECZNE = new Set(["paused", "blocked", "archived"]);

function mapCat(catName) {
  const t = (catName || "").toLowerCase();
  if (/przegl|serwis|protect|usług|uslug|abonament|aktywacj|pakiet/.test(t)) return "uslugi-i-reklama";
  if (/fotowolt|magazyn|pompa|pompy|ogrzewan|falownik|piec|kocio|klimatyz|charge|ev|termostat|grzejnik|radiator|thermo|elektromobil/.test(t)) return "oze-i-energia";
  if (/woda|water|filtr/.test(t)) return "dom-i-ogrod";
  if (/smart|czujnik|sensor|oświetl|oswietl|light|bulb|gniazd|plug|zamek|lock|kamera|camera|bezpiecze/.test(t)) return "elektronika";
  return "elektronika";
}
function svgFor(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" rx="28" fill="#0b2350"/><circle cx="300" cy="170" r="90" fill="rgba(255,210,63,.15)"/><text x="300" y="320" font-size="26" font-family="Arial" font-weight="700" fill="#ffd23f" text-anchor="middle">${(name||"Sunrise").replace(/[<>&]/g,"")}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.headers.get("x-sync-secret") !== SYNC_SECRET) return json({ error: "unauthorized" }, 401);

  const URL = Deno.env.get("SUPABASE_URL"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(URL, SVC, { db: { schema: "market" } });

  const h = { apikey: MS_ANON, Authorization: "Bearer " + MS_ANON };
  const [pr, cr] = await Promise.all([
    fetch(`${MS_URL}/rest/v1/shop_products?active=eq.true&select=id,name,sku,description,price_pln,image_url,category_id,stock_qty`, { headers: h }),
    fetch(`${MS_URL}/rest/v1/shop_categories?select=id,name`, { headers: h }),
  ]);
  const products = await pr.json().catch(() => []);
  const cats = await cr.json().catch(() => []);
  if (!Array.isArray(products)) return json({ error: "MySunrise fetch failed", detail: products }, 502);
  const catName = (id) => (cats.find?.((c) => c.id === id)?.name) ?? "";

  const { data: seller } = await admin.from("sellers").select("id").eq("seller_type", "sunrise").limit(1).maybeSingle();
  if (!seller) return json({ error: "Brak sprzedawcy Sunrise." }, 400);
  const { data: mcats } = await admin.from("categories").select("id,slug");
  const catId = (slug) => (mcats ?? []).find((c) => c.slug === slug)?.id ?? null;

  let inserted = 0, updated = 0, archived = 0, keptHidden = 0; const errs = [];
  const aktywneId = new Set();

  for (const p of products) {
    try {
      aktywneId.add(String(p.id));
      const slug = mapCat(catName(p.category_id));
      const cid = catId(slug) ?? catId("elektronika");
      const img = (typeof p.image_url === "string" && p.image_url.length > 20) ? p.image_url : svgFor(p.name);
      const price = Number(p.price_pln) || 0;
      const descr = (p.description && String(p.description).length > 5) ? String(p.description) : `${p.name} — produkt Sunrise Energy. Zakupy w Sunrise Market: płatność Sunrise Pay, pełny program partnerski (MLM).`;
      const { data: existing } = await admin.from("offers").select("id,status").eq("fulfillment_provider", "mysunrise").or(`attributes->>mysunrise_id.eq.${p.id},title.eq.${p.name.replace(/,/g," ")}`).limit(1).maybeSingle();
      let match = existing;
      if (!match) { const { data: bytitle } = await admin.from("offers").select("id,status").eq("fulfillment_provider", "mysunrise").eq("title", p.name).limit(1).maybeSingle(); match = bytitle; }
      const attrs = { source: "mysunrise", mysunrise_id: p.id, mysunrise_sku: p.sku ?? null, own_brand: true, enriched: true };
      if (match) {
        const patch = { title: p.name, description: descr, price_gross: price, image_url: img, category_id: cid, commission_model: "mlm_full", attributes: attrs, updated_at: new Date().toISOString() };
        // Ręcznie ukryta/zablokowana/zarchiwizowana oferta zachowuje swój status.
        if (STATUSY_RECZNE.has(match.status)) { keptHidden++; } else { patch.status = "active"; }
        await admin.from("offers").update(patch).eq("id", match.id);
        updated++;
      } else {
        await admin.from("offers").insert({ seller_id: seller.id, category_id: cid, title: p.name, description: descr, price_gross: price, currency: "PLN", stock: Number(p.stock_qty ?? 0), status: "active", image_url: img, fulfillment_provider: "mysunrise", commission_model: "mlm_full", attributes: attrs });
        inserted++;
      }
    } catch (e) { errs.push({ name: p?.name, e: String(e).slice(0, 120) }); }
  }

  // Dezaktywacja: oferta pochodzaca z MySunrise, ktorej produkt nie jest juz aktywny,
  // znika ze sklepu (status draft). Nic nie kasujemy — zamowienia historyczne zostaja spojne.
  try {
    const { data: nasze } = await admin.from("offers")
      .select("id, attributes")
      .eq("fulfillment_provider", "mysunrise")
      .eq("status", "active");
    const doWygaszenia = (nasze ?? [])
      .filter((o) => {
        const msId = o?.attributes?.mysunrise_id;
        return msId && !aktywneId.has(String(msId));
      })
      .map((o) => o.id);
    if (doWygaszenia.length) {
      await admin.from("offers").update({ status: "draft", updated_at: new Date().toISOString() }).in("id", doWygaszenia);
      archived = doWygaszenia.length;
    }
  } catch (e) { errs.push({ name: "dezaktywacja", e: String(e).slice(0, 120) }); }

  return json({ ok: true, source_active: products.length, inserted, updated, kept_hidden: keptHidden, archived, errs: errs.slice(0, 5), at: new Date().toISOString() });
});
