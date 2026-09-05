// cj-import-feed v9 — keyword/feed przez /product/list (sprawdzone). Token CJ cache.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const round2 = (n) => Math.round(n * 100) / 100;
function priceFrom(v) { const nums = String(v ?? "").match(/[0-9]+(?:\.[0-9]+)?/g); return nums && nums.length ? Math.max(...nums.map(Number)) : 0; }

async function getToken(admin) {
  const { data: rows } = await admin.from("platform_config").select("key,value").in("key", ["cj_access_token", "cj_token_exp"]);
  const m = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  const now = Date.now();
  if (m.cj_access_token && m.cj_token_exp && Number(m.cj_token_exp) > now + 60000) return m.cj_access_token;
  const key = Deno.env.get("CJ_API_KEY"); if (!key) return null;
  const r = await fetch(`${CJ_BASE}/authentication/getAccessToken`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
  const j = await r.json().catch(() => null);
  const tok = j?.data?.accessToken ?? null;
  if (tok) { const exp = now + 12 * 24 * 3600 * 1000; await admin.from("platform_config").upsert([{ key: "cj_access_token", value: tok }, { key: "cj_token_exp", value: String(exp) }]); }
  return tok;
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
  if (has(/\b(dress|shoe|sneaker|earring|necklace|ring|bracelet|sweatshirt|pullover|sweater|swimsuit|bikini|shirt|blouse|jeans|denim|wallet|handbag|apparel|jewelry|lingerie|underwear|bra\b|panties|briefs|boxer|sukienk|bluz|spodnie|naszyjnik|piers?cionek|kolczyk|sanda|koszul|majtki|portfel|but|torebk|kurtk|sweter|bielizn|stanik|czapk|okular|bransoletk|kamizelk|bizuteri|odziez)/)) return "moda";
  if (has(/\b(speaker|headphone|earbud|earphone|bluetooth|camera|watch|electronic|tv\b|projector|telefon|ladowark|kabel|sluchawk|glosnik|aparat|powerbank|smartwatch|projektor)/)) return "elektronika";
  if (has(/\b(kitchen|garden|lamp|light|fountain|decor|storage|organizer|blanket|pillow|scale|tool|cabinet|home|household|furniture|kuchen|kuchn|ogrod|fontann|kubek|kolder|koc|poduszk|waga|szaf|skrzynk|narzedz|dekoracj|girland|szyld|stojak|fartuch|wieszak|detektor|alarm|oswietl|bonsai|doniczk|pled|mata|kosark|pojemnik|grill|wozek|sciereczk|pianka|preparat|uszczel|gwiazd|zegar|smieci|szczypce|swiec|mebl)/)) return "dom-i-ogrod";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);

  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const token = await getToken(admin);
  if (!token) return json({ available: false, error: "Brak/nieprawidlowy CJ token." });

  const { data: cfgRows } = await admin.from("platform_config").select("key,value").in("key", ["cj_markup_pct", "cj_fx_usd_pln", "cj_default_category_slug", "cj_price_floor_zl", "cj_shipping_allowance_zl"]);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const markup = Number(cfg.cj_markup_pct ?? "35"); const fx = Number(cfg.cj_fx_usd_pln ?? "4");
  const floor = Number(cfg.cj_price_floor_zl ?? "39"); const shipAllow = Number(cfg.cj_shipping_allowance_zl ?? "18");
  const defSlug = cfg.cj_default_category_slug || "elektronika";
  const { data: seller } = await admin.from("sellers").select("id").eq("seller_type", "sunrise").limit(1).maybeSingle();
  if (!seller) return json({ error: "Brak sprzedawcy Sunrise." }, 400);
  const { data: catsAll } = await admin.from("categories").select("id,slug");
  const catId = (slug) => (catsAll ?? []).find((c) => c.slug === slug)?.id ?? null;
  const defCat = catId(defSlug);

  const pageSize = Math.min(Number(body.pageSize ?? 15), 50);
  let keywords = Array.isArray(body.keywords) ? body.keywords.map((k) => String(k)).filter(Boolean) : [];
  if (!keywords.length && body.categoryKeyword) keywords = [String(body.categoryKeyword)];

  const queries = [];
  if (keywords.length) { for (const kw of keywords) queries.push({ kw, page: Number(body.page ?? 1) }); }
  else {
    const { data: cur } = await admin.from("cj_pull_cursor").select("next_page").eq("id", 1).maybeSingle();
    queries.push({ kw: null, page: Number(body.page ?? cur?.next_page ?? 1) });
  }

  let imported = 0, updated = 0, fetched = 0; const perKw = [];
  for (const q of queries) {
    const params = new URLSearchParams({ pageNum: String(q.page), pageSize: String(pageSize) });
    if (q.kw) params.set("productNameEn", q.kw);
    const lr = await fetch(`${CJ_BASE}/product/list?${params.toString()}`, { headers: { "CJ-Access-Token": token } });
    const lj = await lr.json().catch(() => null);
    const items = Array.isArray(lj?.data?.list) ? lj.data.list : [];
    let impKw = 0, updKw = 0;
    for (const p of items) {
      fetched++;
      const pid = String(p.pid ?? p.productId ?? ""); if (!pid) continue;
      const priceUsd = priceFrom(p.sellPrice ?? p.productSellPrice);
      const priceGross = Math.max(floor, round2((priceUsd * fx + shipAllow) * (1 + markup / 100)));
      const title = String(p.productNameEn ?? p.productName ?? "Produkt CJ").slice(0, 200);
      const img = p.productImage ?? (Array.isArray(p.productImageSet) ? p.productImageSet[0] : null) ?? null;
      const sku = p.productSku ?? null;
      const cjCat = [p.categoryName].filter(Boolean).join(" ");
      const slug = guessSlug(`${title} ${cjCat}`) ?? defSlug;
      const cid = catId(slug) ?? defCat;
      const { data: existing } = await admin.from("cj_product_map").select("offer_id").eq("cj_pid", pid).eq("cj_vid", "").maybeSingle();
      if (existing?.offer_id) { await admin.from("offers").update({ updated_at: new Date().toISOString() }).eq("id", existing.offer_id); updated++; updKw++; continue; }
      const { data: off, error: oe } = await admin.from("offers").insert({ seller_id: seller.id, category_id: cid, title, description: `Import CJ (pid ${pid}). Do weryfikacji.`, price_gross: priceGross, currency: "PLN", stock: Number(p.stock ?? 100), status: "draft", image_url: img, fulfillment_provider: "cj", commission_model: "cashback_only", attributes: { source: "cj", cj_pid: pid, kw: q.kw } }).select("id").single();
      if (oe || !off) continue;
      await admin.from("cj_product_map").insert({ offer_id: off.id, cj_pid: pid, cj_vid: "", cj_sku: sku, supplier_price: priceUsd, supplier_currency: "USD" });
      if (img) { try { await admin.from("offer_images").insert({ offer_id: off.id, url: img }); } catch (_e) {} }
      imported++; impKw++;
    }
    perKw.push({ kw: q.kw, page: q.page, fetched: items.length, imported: impKw, updated: updKw, msg: lj?.message });
  }
  if (!keywords.length) { const p0 = queries[0].page; await admin.from("cj_pull_cursor").update({ next_page: p0 + 1 }).eq("id", 1); }
  return json({ ok: true, fetched, imported, updated, perKw });
});
