// woo-catalog-pull: import produktów z WooCommerce (TeemDrop) do Sunrise 1:1 —
// auto-kategoryzacja (Claude), wycena rynkowa PL (max marża), galerie + WARIANTY (kolor/rozmiar) + specyfikacja.
// Długie opisy: enrich-descriptions. Wywołanie: POST x-bridge-token, body {max_pages}.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WOO = Deno.env.get('WOO_BASE_URL') ?? '';
const CK = Deno.env.get('WOO_CONSUMER_KEY') ?? '';
const CS = Deno.env.get('WOO_CONSUMER_SECRET') ?? '';
const BRIDGE_TOKEN = Deno.env.get('BRIDGE_INTERNAL_TOKEN') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SELLER = '11111111-1111-1111-1111-111111111111';
const FX = Number(Deno.env.get('CATALOG_FX') ?? '3.75');

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!, { db: { schema: 'market' } });
const wooAuth = 'Basic ' + btoa(`${CK}:${CS}`);
const strip = (h: string) => (h ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const nice = (v: number) => Math.max(9, Math.ceil(v / 10) * 10 - 1);

async function analyze(batch: { id: number; title: string; desc: string }[], catList: string): Promise<Record<string, { slug: string; pl: number }>> {
  if (!ANTHROPIC) return {};
  const prompt = `Jesteś analitykiem e-commerce PL. Dla każdego produktu: 1) wybierz JEDEN slug kategorii z listy, 2) oszacuj cenę rynkową BRUTTO PLN porównywalnego produktu na Allegro/Erli (mediana). Odpowiedz TYLKO JSON {\"<id>\":{\"slug\":\"..\",\"pl\":<liczba>}}.\nKATEGORIE:\n${catList}\nPRODUKTY:\n${batch.map((p) => `${p.id}: ${p.title} — ${p.desc.slice(0, 180)}`).join('\n')}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json(); const m = (j?.content?.[0]?.text ?? '{}').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {};
  } catch { return {}; }
}

Deno.serve(async (req) => {
  if (BRIDGE_TOKEN && req.headers.get('x-bridge-token') !== BRIDGE_TOKEN) return new Response('unauthorized', { status: 401 });
  if (!WOO || !CK || !CS) return new Response(JSON.stringify({ error: 'Brak konfiguracji WOO_*' }), { status: 500 });
  const body = await req.json().catch(() => ({})); const maxPages = Math.min(Number(body.max_pages ?? 20), 100);
  const { data: cats } = await sb.rpc('leaf_categories_for_ai');
  const catBySlug: Record<string, string> = {}; const catLines: string[] = [];
  for (const c of (cats ?? [])) { catBySlug[c.slug] = c.id; catLines.push(`${c.slug} = ${c.label}`); }
  const catList = catLines.join('\n'); const fallbackCat = (cats ?? [])[0]?.id;
  let created = 0, updated = 0, skipped = 0, images = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${WOO}/wp-json/wc/v3/products?per_page=50&page=${page}&status=publish`, { headers: { Authorization: wooAuth } });
    if (!res.ok) break; const products = await res.json();
    if (!Array.isArray(products) || products.length === 0) break;
    for (let i = 0; i < products.length; i += 12) {
      const chunk = products.slice(i, i + 12);
      const info = await analyze(chunk.map((p: any) => ({ id: p.id, title: p.name, desc: strip(p.short_description || p.description || '') })), catList);
      for (const p of chunk) {
        const costUsd = Number(p.meta_data?.find((m: any) => m.key === '_teemdrop_cost')?.value ?? p.price ?? 0);
        if (!costUsd) { skipped++; continue; }
        const weight = Number(p.weight ?? 0); const ship = weight <= 0.3 ? 8 : weight <= 1 ? 15 : weight <= 3 ? 25 : 40;
        const landed = Math.round(costUsd * FX + ship);
        const ai = info[String(p.id)] || { slug: '', pl: 0 }; const plMarket = Number(ai.pl) || 0;
        const floor = nice(landed * 1.6); const price = plMarket > floor ? nice(plMarket * 0.97) : floor;
        const categoryId = (ai.slug && catBySlug[ai.slug]) || fallbackCat;
        const gallery: string[] = (p.images || []).map((im: any) => im.src).filter(Boolean);
        const image = gallery[0] ?? null; const stock = p.stock_quantity == null ? 50 : Number(p.stock_quantity);
        // Warianty i specyfikacja z atrybutów Woo
        const wa = Array.isArray(p.attributes) ? p.attributes : [];
        const colors = (wa.find((a: any) => /kolor|color/i.test(a.name))?.options) || [];
        const sizes = (wa.find((a: any) => /rozmiar|size/i.test(a.name))?.options) || [];
        const specs: Record<string, string> = {};
        for (const a of wa) { if (!/kolor|color|rozmiar|size/i.test(a.name)) specs[a.name] = (a.options || []).join(', '); }
        const attrs = { source: 'teemdrop', woo_id: p.id, landed_cost_pln: landed, cost_usd: costUsd, pl_market_est: plMarket, colors, sizes, specs };
        const descr = strip(p.description || p.short_description || '');
        let oid: string | null = null;
        const { data: existing } = await sb.from('teemdrop_product_map').select('offer_id').eq('woo_product_id', p.id).maybeSingle();
        if (existing?.offer_id) { oid = existing.offer_id; await sb.from('offers').update({ title: p.name, description: descr, price_gross: price, stock, status: stock > 0 ? 'active' : 'hidden', image_url: image, category_id: categoryId, attributes: attrs, updated_at: new Date().toISOString() }).eq('id', oid); updated++; }
        else { const { data: ins } = await sb.from('offers').insert({ seller_id: SELLER, category_id: categoryId, title: p.name, description: descr, price_gross: price, currency: 'PLN', stock, status: stock > 0 ? 'active' : 'hidden', image_url: image, attributes: attrs, fulfillment_provider: 'teemdrop', commission_model: 'cashback_only' }).select('id').single(); if (ins?.id) { oid = ins.id; await sb.from('teemdrop_product_map').insert({ offer_id: ins.id, woo_product_id: p.id, teemdrop_sku: p.sku || null, active: true }); created++; } }
        if (oid && gallery.length) { const rows = gallery.slice(0, 10).map((u, idx) => ({ offer_id: oid, url: u, sort: idx })); const { error: gErr } = await sb.from('offer_images').upsert(rows, { onConflict: 'offer_id,url', ignoreDuplicates: true }); if (!gErr) images += rows.length; }
      }
    }
  }
  return new Response(JSON.stringify({ created, updated, skipped, images }), { headers: { 'Content-Type': 'application/json' } });
});
