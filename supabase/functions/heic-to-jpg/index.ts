// Konwersja zdjęć HEIC/HEIF (z iPhone'a) na JPEG w buckecie product-images.
// Dekoder heic-decode + jpeg-js (jak w repair-offer-images) — transformacja Supabase /render/image
// gubiła proporcje przy HEIC (2000×4284 zamiast oryginalnych), więc dekodujemy plik sami.
// Jedno zdjęcie na wywołanie (dekodowanie 12 Mpix jest ciężkie); wywołuj w pętli aż `remaining` = 0.
// Autoryzacja: X-Sunrise-Service-Token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import decode from "npm:heic-decode@2.0.0";
import jpeg from "npm:jpeg-js@0.4.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunrise-service-token" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "product-images";
const MAX_SIDE = 2000;

/** Uśredniające pomniejszenie RGBA (bez bibliotek) — zachowuje proporcje. */
function downscale(data: Uint8Array, w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  if (scale >= 1) return { data, width: w, height: h };
  const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
  const out = new Uint8Array(nw * nh * 4);
  const bx = w / nw, by = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * by), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * by)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * bx), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * bx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { data: out, width: nw, height: nh };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPA, SERVICE, { db: { schema: "market" } });
  const { data: sec } = await sb.from("internal_secrets").select("value").eq("key", "sunrise_pay_service_token").maybeSingle();
  const expected = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN") ?? String(sec?.value ?? "");
  if (!expected || req.headers.get("X-Sunrise-Service-Token") !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPA, SERVICE);
  const { data: files, error: le } = await admin.storage.from(BUCKET).list("", { limit: 1000 });
  if (le) return json({ error: "list_failed", message: le.message }, 500);
  const heic = (files ?? []).filter((f) => /\.(heic|heif)$/i.test(f.name)).map((f) => f.name);
  const body = await req.json().catch(() => ({}));
  const only = typeof body?.name === "string" ? body.name : null;
  const todo = only ? heic.filter((n) => n === only) : heic;
  if (!todo.length) return json({ ok: true, remaining: 0, converted: null });

  const name = todo[0];
  try {
    const { data: blob, error: de } = await admin.storage.from(BUCKET).download(name);
    if (de || !blob) throw new Error(de?.message ?? "download failed");
    const raw: any = await decode({ buffer: new Uint8Array(await blob.arrayBuffer()) });
    if (!raw?.data || !raw.width || !raw.height) throw new Error("decoder returned nothing");
    const small = downscale(new Uint8Array(raw.data), raw.width, raw.height, MAX_SIDE);
    const enc = jpeg.encode({ data: small.data, width: small.width, height: small.height }, 84);
    if (!enc?.data?.length) throw new Error("encode failed");
    const target = name.replace(/\.(heic|heif)$/i, "") + ".jpg";
    const { error: ue } = await admin.storage.from(BUCKET).upload(target, enc.data, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (ue) throw new Error(ue.message);
    return json({ ok: true, converted: target, source: `${raw.width}x${raw.height}`, saved: `${small.width}x${small.height}`, bytes: enc.data.length, remaining: todo.length - 1 });
  } catch (e) {
    return json({ ok: false, name, error: String((e as Error)?.message ?? e), remaining: todo.length }, 500);
  }
});
