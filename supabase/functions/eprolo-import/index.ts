// eprolo-import v1 — katalog Eprolo (eprolo_product_list.html) -> oferty draft. Lustro cj-import-feed.
// Auth Eprolo: header apiKey + sign=MD5(apiKey+timestamp+apiSecret) + timestamp(ms,13). Domena https://openapi.eprolo.com/
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const EPROLO_BASE = "https://openapi.eprolo.com";
const round2 = (n) => Math.round(n * 100) / 100;

// Nagłówki + query z podpisem Eprolo (sign i timestamp również w query — jak w tutorialu Postman).
function eproloAuth(apiKey, apiSecret) {
  const timestamp = String(Date.now()); // ms, 13 cyfr, GMT+0
  const sign = createHash("md5").update(apiKey + timestamp + apiSecret).digest("hex");
  return { timestamp, sign };
}

// najniższy dodatni koszt wariantu (USD)
function minVariantCost(variantlist) {
  const costs = (Array.isArray(variantlist) ? variantlist : [])
    .map((v) => Number(v?.cost)).filter((n) => Number.isFinite(n) && n > 0);
  return costs.length ? Math.min(...costs) : 0;
}
function maxVariantStock(variantlist) {
  const st = (Array.isArray(variantlist) ? variantlist : [])
    .map((v) => Number(v?.inventory_quantity)).filter((n) => Number.isFinite(n) && n >= 0);
  return st.length ? Math.max(...st) : 100;
}

function guessSlug(text) {
  const t = (text || "").toLowerCase();
  const has = (re) => re.test(t);
  if (has(/\b(dog|cat|pet|puppy|aquarium|leash|pies|kot|zwierz|karma|smycz|drapak|akwari|legowisk|kuweta)/)) return "zwierzeta";
  if (has(/\b(toy|toys|baby|children|kids|doll|plush|zabawk|dzieck|niemowl|pluszak|lalk|klock)/)) return "dziecko";
  if (has(/\b(motocross|motorcycle|motocykl|handguard|automotive|car\b|samochod|felg|opon)/)) return "motoryzacja";
  if (has(/\b(kitchen appliance|air fryer|blender|toaster|kettle|coffee maker|vacuum|appliance|mikser|czajnik|toster|frytkownic|odkurzacz|ekspres|agd)/)) return "agd";
  if (has(/\b(nail|hair|wig|straighten|clipper|razor|shaver|makeup|beauty|cosmetic|skincare|serum|massage|frezark|paznok|prostownic|makija|kosmetyk|pielegnacj|masaz|depilac|grzybic|peruka)/)) return "zdrowie-i-uroda";
  if (has(/\b(sport|fitness|yoga|gym|dumbbell|bike|camping|outdoor|joga|hantle|rower|silowni|trening|namiot|turyst)/)) return "sport-i-turystyka";
  if (has(/\b(dress|shoe|sneaker|earring|necklace|ring|bracelet|sweatshirt|pullover|sweater|swimsuit|bikini|shirt|blouse|jeans|denim|wallet|handbag|apparel|jewelry|lingerie|underwear|bra\b|panties|briefs|boxer|skirt|sukienk|bluz|spodnie|naszyjnik|piers?cionek|kolczyk|sanda|koszul|majtki|portfel|but|torebk|kurtk|sweter|bielizn|stanik|czapk|okular|bransoletk|kamizelk|bizuteri|odziez|spodnic)/)) return "moda";
  if (has(/\b(speaker|headphone|earbud|earphone|bluetooth|camera|watch|electronic|tv\b|projector|charger|battery|telefon|ladowark|kabel|sluchawk|glosnik|aparat|powerbank|smartwatch|projektor|bateri)/)) return "elektronika";
  if (has(/\b(kitchen|garden|lamp|light|fountain|decor|storage|organizer|blanket|pillow|scale|tool|cabinet|home|household|furniture|kuchen|kuchn|ogrod|fontann|kubek|kolder|koc|poduszk|waga|szaf|skrzynk|narzedz|dekoracj|girland|szyld|stojak|fartuch|wieszak|detektor|alarm|oswietl|bonsai|doniczk|pled|mata|kosark|pojemnik|grill|wozek|sciereczk|pianka|preparat|uszczel|gwiazd|zegar|smieci|szczypce|swiec|mebl)/)) return "dom-i-ogrod";
  return null;
}

async function fetchCatalog(apiKey, apiSecret, page) {
  const { timestamp, sign } = eproloAuth(apiKey, apiSecret);
  const url = `${EPROLO_BASE}/eprolo_product_list.html?page=${encodeURIComponent(String(page))}&sign=${sign}&timestamp=${timestamp}`;
  const r = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json", apiKey, sign, timestamp } });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch { /* zwrócimy surowy tekst w probe */ }
  return { httpStatus: r.status, body: j, raw: txt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);

  const apiKey = Deno.env.get("EPROLO_API_KEY"); const apiSecret = Deno.env.get("EPROLO_API_SECRET");
  if (!apiKey || !apiSecret) return json({ available: false, error: "Brak EPROLO_API_KEY / EPROLO_API_SECRET w Secrets." });

  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));

  // ── PROBE: surowa odpowiedź Eprolo, bez zapisu do bazy ──
  if (body.probe) {
    const res = await fetchCatalog(apiKey, apiSecret, Number(body.page ?? 1));
    const first = Array.isArray(res.body?.data) ? res.body.data[0] : null;
    return json({
      probe: true, httpStatus: res.httpStatus, code: res.body?.code, msg: res.body?.msg,
      count: Array.isArray(res.body?.data) ? res.body.data.length : 0,
      sample: first ? { id: first.id, title: first.title, imagefirst: first.imagefirst, variants: (first.variantlist ?? []).length, minCost: minVariantCost(first.variantlist), stock: maxVariantStock(first.variantlist), sku: first.variantlist?.[0]?.sku } : null,
      rawHead: res.body ? undefined : res.raw?.slice(0, 400),
    });
  }

  const { data: cfgRows } = await admin.from("platform_config").select("key,value").in("key", ["eprolo_markup_pct", "eprolo_fx_usd_pln", "eprolo_default_category_slug", "eprolo_price_floor_zl", "eprolo_shipping_allowance_zl"]);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const markup = Number(cfg.eprolo_markup_pct ?? "35"); const fx = Number(cfg.eprolo_fx_usd_pln ?? "4");
  const floor = Number(cfg.eprolo_price_floor_zl ?? "39"); const shipAllow = Number(cfg.eprolo_shipping_allowance_zl ?? "18");
  const defSlug = cfg.eprolo_default_category_slug || "elektronika";

  const { data: seller } = await admin.from("sellers").select("id").eq("seller_type", "sunrise").limit(1).maybeSingle();
  if (!seller) return json({ error: "Brak sprzedawcy Sunrise." }, 400);
  const { data: catsAll } = await admin.from("categories").select("id,slug");
  const catId = (slug) => (catsAll ?? []).find((c) => c.slug === slug)?.id ?? null;
  const defCat = catId(defSlug);

  const maxPages = Math.min(Math.max(Number(body.pages ?? 1), 1), 10);
  const { data: cur } = await admin.from("eprolo_pull_cursor").select("next_page").eq("id", 1).maybeSingle();
  let page = Number(body.page ?? cur?.next_page ?? 1);

  let imported = 0, updated = 0, fetched = 0; const perPage = [];
  for (let i = 0; i < maxPages; i++) {
    const res = await fetchCatalog(apiKey, apiSecret, page);
    if (res.body?.code !== "0" && res.body?.code !== 0) { perPage.push({ page, error: res.body?.msg ?? `HTTP ${res.httpStatus}` }); break; }
    const items = Array.isArray(res.body?.data) ? res.body.data : [];
    let impP = 0, updP = 0;
    for (const p of items) {
      fetched++;
      const pid = String(p.id ?? ""); if (!pid) continue;
      const priceUsd = minVariantCost(p.variantlist);
      const priceGross = Math.max(floor, round2((priceUsd * fx + shipAllow) * (1 + markup / 100)));
      const title = String(p.title ?? "Produkt Eprolo").slice(0, 200);
      const img = p.imagefirst ?? (Array.isArray(p.imagelist) && p.imagelist.length ? p.imagelist[0].src : null) ?? null;
      const sku = p.variantlist?.[0]?.sku ?? null;
      const slug = guessSlug(title) ?? defSlug;
      const cid = catId(slug) ?? defCat;
      const { data: existing } = await admin.from("eprolo_product_map").select("offer_id").eq("eprolo_pid", pid).eq("eprolo_vid", "").maybeSingle();
      if (existing?.offer_id) { await admin.from("offers").update({ stock: maxVariantStock(p.variantlist), updated_at: new Date().toISOString() }).eq("id", existing.offer_id); updated++; updP++; continue; }
      const { data: off, error: oe } = await admin.from("offers").insert({ seller_id: seller.id, category_id: cid, title, description: `Import Eprolo (id ${pid}). Do weryfikacji.`, price_gross: priceGross, currency: "PLN", stock: maxVariantStock(p.variantlist), status: "draft", image_url: img, fulfillment_provider: "eprolo", commission_model: "cashback_only", attributes: { source: "eprolo", eprolo_pid: pid, page } }).select("id").single();
      if (oe || !off) continue;
      await admin.from("eprolo_product_map").insert({ offer_id: off.id, eprolo_pid: pid, eprolo_vid: "", eprolo_sku: sku, supplier_price: priceUsd, supplier_currency: "USD" });
      // galeria: imagelist[].src
      const imgs = Array.isArray(p.imagelist) ? p.imagelist.map((x) => x?.src).filter(Boolean).slice(0, 8) : (img ? [img] : []);
      for (const u of imgs) { try { await admin.from("offer_images").insert({ offer_id: off.id, url: u }); } catch (_e) {} }
      imported++; impP++;
    }
    perPage.push({ page, fetched: items.length, imported: impP, updated: updP });
    if (!items.length) break;
    page++;
  }
  if (body.page === undefined) { await admin.from("eprolo_pull_cursor").update({ next_page: page }).eq("id", 1); }
  return json({ ok: true, fetched, imported, updated, nextPage: page, perPage });
});
