// cj-enrich v3 — galerie, warianty, specyfikacje, wideo, opis PL + cena rynkowa CJ.
// Sterowane lista ID: body.ids[] (pewne). QPS CJ = 1/s. Token cache w platform_config.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const COLOR_PL = { black:"czarny", white:"biały", red:"czerwony", blue:"niebieski", green:"zielony", yellow:"żółty", pink:"różowy", purple:"fioletowy", grey:"szary", gray:"szary", brown:"brązowy", beige:"beżowy", gold:"złoty", silver:"srebrny", orange:"pomarańczowy", navy:"granatowy", khaki:"khaki" };
function plColor(s){ const k=String(s||"").trim().toLowerCase(); return COLOR_PL[k] ? COLOR_PL[k].charAt(0).toUpperCase()+COLOR_PL[k].slice(1) : (s||"").trim(); }
function buildDescription(title, catName, materials, colors, sizes) {
  const parts = [];
  parts.push(`${title} to produkt dostępny w Sunrise Market w kategorii ${catName || "nasz asortyment"}. Starannie wyselekcjonowany pod kątem jakości wykonania i codziennej użyteczności — łączy solidne materiały z estetycznym, nowoczesnym wyglądem.`);
  const facts = [];
  if (materials && materials.length) facts.push(`Wykonany z: ${materials.slice(0,4).join(", ")}.`);
  if (colors && colors.length) facts.push(`Dostępne warianty kolorów: ${colors.slice(0,8).join(", ")}.`);
  if (sizes && sizes.length) facts.push(`Rozmiary do wyboru: ${sizes.slice(0,10).join(", ")}.`);
  if (facts.length) parts.push(facts.join(" "));
  parts.push(`Zakupy w Sunrise Market to realne korzyści: płacisz wygodnie z portfela Sunrise Pay, a 3% wartości zamówienia wraca do Ciebie w punktach na portfel (Sunrise Family Club). Obejmuje ochrona kupującego, a zwroty realizujemy na saldo portfela.`);
  parts.push(`Wysyłka: Paczkomat InPost lub kurier — darmowa dostawa od 149 zł. Zamów dziś i dołącz do społeczności Sunrise.`);
  return parts.join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);
  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 30) : [];
  if (!ids.length) return json({ error: "Podaj ids[]." }, 400);

  const token = await getToken(admin);
  if (!token) return json({ error: "Brak/nieprawidlowy CJ token." });

  const { data: cfgRows } = await admin.from("platform_config").select("key,value").in("key", ["cj_fx_usd_pln"]);
  const fx = Number((cfgRows ?? []).find((r) => r.key === "cj_fx_usd_pln")?.value ?? "4");
  const { data: offers } = await admin.from("offers").select("id,title,category_id,price_gross,attributes").in("id", ids);
  const { data: cats } = await admin.from("categories").select("id,name");
  const catName = (id) => (cats ?? []).find((c) => c.id === id)?.name ?? null;

  let enriched = 0, withGallery = 0, withVideo = 0, withMarket = 0; const errs = [];
  for (let i = 0; i < (offers ?? []).length; i++) {
    const off = offers[i];
    if (i > 0) await sleep(1150);
    const pid = off.attributes?.cj_pid;
    if (!pid) { errs.push({ id: off.id, e: "brak cj_pid" }); continue; }
    try {
      const r = await fetch(`${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`, { headers: { "CJ-Access-Token": token } });
      const j = await r.json().catch(() => null);
      const d = j?.data;
      if (!d) { errs.push({ id: off.id, e: j?.message ?? "brak data" }); continue; }
      let imgs = Array.isArray(d.productImageSet) ? d.productImageSet.filter(Boolean) : [];
      imgs = Array.from(new Set(imgs)).slice(0, 10);
      if (imgs.length) {
        await admin.from("offer_images").delete().eq("offer_id", off.id);
        await admin.from("offer_images").insert(imgs.map((u) => ({ offer_id: off.id, url: u })));
        await admin.from("offers").update({ image_url: imgs[0] }).eq("id", off.id);
        withGallery++;
      }
      const variants = Array.isArray(d.variants) ? d.variants : [];
      const colorSet = new Set(), sizeSet = new Set();
      for (const v of variants) {
        const keyParts = String(v.variantKey ?? v.variantNameEn ?? "").split(/[-/]/).map((x) => x.trim()).filter(Boolean);
        if (keyParts[0]) colorSet.add(plColor(keyParts[0]));
        if (keyParts[1]) sizeSet.add(keyParts[1]);
      }
      const colors = Array.from(colorSet).slice(0, 12);
      const sizes = Array.from(sizeSet).slice(0, 14);
      const materials = Array.isArray(d.materialNameEnSet) ? d.materialNameEnSet.filter(Boolean) : [];
      const specs = {};
      if (materials.length) specs["Materiał"] = materials.slice(0, 4).join(", ");
      if (d.productWeight) specs["Waga"] = `${d.productWeight} g`;
      if (d.categoryName) specs["Kategoria CJ"] = String(d.categoryName).split(/\s*>\s*|;/).slice(-1)[0];
      if (variants.length) specs["Warianty"] = String(variants.length);
      let video = null;
      const pv = d.productVideo;
      if (typeof pv === "string" && /\.(mp4|mov|webm)/i.test(pv)) video = pv;
      else if (Array.isArray(pv) && pv.length && typeof pv[0] === "string" && /\.(mp4|mov|webm)/i.test(pv[0])) video = pv[0];
      if (video) withVideo++;
      // cena rynkowa CJ (suggestSellPrice) -> benchmark konkurencji
      const suggestUsd = priceFrom(d.suggestSellPrice);
      const costUsd = priceFrom(d.sellPrice);
      const marketPln = suggestUsd > 0 ? round2(suggestUsd * fx) : null;
      if (marketPln) withMarket++;
      const desc = buildDescription(off.title, catName(off.category_id), materials, colors, sizes);
      const features = [];
      if (colors.length) features.push(`${colors.length} wariantów kolorystycznych do wyboru`);
      if (sizes.length) features.push(`Dostępne rozmiary: ${sizes.slice(0,6).join(", ")}`);
      features.push("Cashback 3% na portfel Sunrise Pay");
      features.push("Ochrona kupującego i zwroty na saldo portfela");
      const attrs = { ...(off.attributes ?? {}), colors, sizes, specs, features, video, cj_cost_usd: costUsd || null, cj_suggest_usd: suggestUsd || null, market_price_pln: marketPln, listed_num: Number(d.listedNum ?? off.attributes?.listed_num ?? 0), enriched: true, enriched_at: new Date().toISOString() };
      await admin.from("offers").update({ description: desc, attributes: attrs, updated_at: new Date().toISOString() }).eq("id", off.id);
      enriched++;
    } catch (e) { errs.push({ id: off.id, e: String(e).slice(0, 120) }); }
  }
  return json({ ok: true, requested: ids.length, enriched, withGallery, withVideo, withMarket, errs: errs.slice(0, 4) });
});
