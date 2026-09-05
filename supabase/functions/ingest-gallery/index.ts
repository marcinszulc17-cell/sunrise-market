// ingest-gallery: przyjmuje galerie zdjęć z przeglądarki (harness na TeemDrop) i zapisuje
// do offer_images dopasowując po SPU. CORS włączony. Body: {items:[{spu, urls:[]}]}.
import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bridge-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!, { db: { schema: 'market' } });
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  let matched = 0, images = 0;
  for (const it of items) {
    const spu = String(it.spu || '').trim();
    const urls: string[] = (it.urls || []).map((u: string) => String(u).split('?')[0]).filter(Boolean);
    if (!spu || urls.length === 0) continue;
    const { data: off } = await sb.from('offers').select('id, image_url').eq('attributes->>teemdrop_spu', spu).limit(1).maybeSingle();
    if (!off?.id) continue;
    matched++;
    const rows = urls.slice(0, 10).map((u, i) => ({ offer_id: off.id, url: u, sort: i }));
    const { error } = await sb.from('offer_images').upsert(rows, { onConflict: 'offer_id,url', ignoreDuplicates: true });
    if (!error) images += rows.length;
    if (!off.image_url && urls[0]) await sb.from('offers').update({ image_url: urls[0] }).eq('id', off.id);
  }
  return json({ matched, images });
});
