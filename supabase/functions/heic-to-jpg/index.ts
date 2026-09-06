// Jednorazowa konwersja zdjęć HEIC/HEIF (z iPhone'a) na JPEG w buckecie product-images.
// Zamiast dekodera w Deno używamy transformacji Supabase (/render/image), która sama przekodowuje HEIC → JPEG,
// zapisujemy wynik jako nowy plik .jpg i podmieniamy adresy w market.offers.image_url i market.offer_images.url.
// Autoryzacja: X-Sunrise-Service-Token (ten sam sekret co inne funkcje wewnętrzne).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunrise-service-token" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "product-images";
const isHeic = (u: string) => /\.(heic|heif)(?:\?|$)/i.test(u);
const pathOf = (u: string) => { const m = u.match(/\/storage\/v1\/(?:object|render\/image)\/public\/product-images\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPA, SERVICE, { db: { schema: "market" } });
  const { data: sec } = await sb.from("internal_secrets").select("value").eq("key", "sunrise_pay_service_token").maybeSingle();
  const expected = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN") ?? String(sec?.value ?? "");
  if (!expected || req.headers.get("X-Sunrise-Service-Token") !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPA, SERVICE);
  const done: Record<string, string> = {}; const errors: string[] = [];
  async function convert(url: string): Promise<string | null> {
    const p = pathOf(url); if (!p || !isHeic(p)) return null;
    if (done[p]) return done[p];
    const render = `${SUPA}/storage/v1/render/image/public/${BUCKET}/${encodeURIComponent(p)}?width=2000&quality=84`;
    const r = await fetch(render);
    if (!r.ok) { errors.push(`${p}: render ${r.status}`); return null; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const newPath = p.replace(/\.(heic|heif)$/i, "") + ".jpg";
    const up = await admin.storage.from(BUCKET).upload(newPath, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (up.error) { errors.push(`${p}: upload ${up.error.message}`); return null; }
    const pub = admin.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
    done[p] = pub; return pub;
  }

  const { data: offers } = await sb.from("offers").select("id,image_url").not("image_url", "is", null);
  let mains = 0;
  for (const o of offers ?? []) {
    if (!isHeic(String(o.image_url))) continue;
    const pub = await convert(String(o.image_url)); if (!pub) continue;
    const { error } = await sb.from("offers").update({ image_url: `${pub}?width=900&height=700&resize=cover&quality=82`.replace("/object/public/", "/render/image/public/") }).eq("id", o.id);
    if (error) errors.push(`offer ${o.id}: ${error.message}`); else mains++;
  }
  const { data: gal } = await sb.from("offer_images").select("id,url");
  let extras = 0;
  for (const g of gal ?? []) {
    if (!isHeic(String(g.url))) continue;
    const pub = await convert(String(g.url)); if (!pub) continue;
    const { error } = await sb.from("offer_images").update({ url: pub }).eq("id", g.id);
    if (error) errors.push(`gallery ${g.id}: ${error.message}`); else extras++;
  }
  return json({ ok: true, converted_files: Object.keys(done).length, offers_updated: mains, gallery_updated: extras, errors });
});
