// Obrazek do podglądu udostępnianego ogłoszenia (og:image) — ZAWSZE JPEG 1200×630.
// Dlaczego: komunikatory (WhatsApp, iMessage, Messenger, LinkedIn) pomijają WebP/HEIC/SVG i zbyt małe miniatury
// (np. 250×250 z katalogu), więc podgląd wyświetlał się bez zdjęcia. Tutaj: zdjęcie oferty (w miarę możliwości
// w większym wariancie) wpasowane na rozmyte tło + logo Sunrise Market, zapisane jako JPEG. Cache 1 dzień na CDN.
import type { IncomingMessage, ServerResponse } from "node:http";
import sharp from "sharp";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://ihehncaaokbwbdqdztna.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZWhuY2Fhb2tid2JkcWR6dG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUyMDMsImV4cCI6MjA5NzY2MTIwM30.jZCKRCmzNRymVoeSJfXuL6v3qemE8NfV5qmNvpFjqi8";
const W = 1200, H = 630;

async function fetchBytes(url: string, timeoutMs = 6000): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "SunriseMarketOG/1.0" } });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// Większy wariant zdjęcia, gdy znamy źródło (PrestaShop sunriserewards.pl: 250px → 800px).
function upgrade(url: string): string[] {
  const out = [url];
  const m = url.match(/^(https:\/\/sunriserewards\.pl\/\d+-)(home_default|medium_default|small_default|cart_default)(\/.*)$/);
  if (m) out.unshift(`${m[1]}large_default${m[3]}`);
  return out;
}

async function offerImage(id: string, origin: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_offer`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "Content-Profile": "market", "Accept-Profile": "market" },
    body: JSON.stringify({ p_id: id }),
  });
  const rows = await r.json().catch(() => []);
  const img = String((Array.isArray(rows) ? rows[0] : null)?.image_url ?? "");
  if (!img || img.startsWith("data:")) return null;
  return img.startsWith("http") ? img : `${origin}${img.startsWith("/") ? "" : "/"}${img}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "https://sunrisemarket.pl");
  const id = url.searchParams.get("id") ?? "";
  const origin = `https://${(req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "sunrisemarket.pl"}`;

  let photo: Buffer | null = null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    try {
      const src = await offerImage(id, origin);
      if (src) for (const candidate of upgrade(src)) { photo = await fetchBytes(candidate); if (photo) break; }
    } catch { /* fallback poniżej */ }
  }

  const logo = await fetchBytes(`${origin}/logo-sunrise-market-light.png`);
  const logoLayer = logo ? await sharp(logo).resize({ width: 260 }).png().toBuffer() : null;

  let out: Buffer;
  try {
    if (photo) {
      const meta = await sharp(photo).metadata();
      if (!meta.width || !meta.height) throw new Error("bad image");
      // Tło: to samo zdjęcie rozmyte i przyciemnione; przód: zdjęcie wpasowane (contain) z marginesem.
      const bg = await sharp(photo).rotate().resize(W, H, { fit: "cover" }).blur(28).modulate({ brightness: 0.55, saturation: 0.9 }).toBuffer();
      const fg = await sharp(photo).rotate().resize(Math.round(W * 0.78), Math.round(H * 0.86), { fit: "inside", withoutEnlargement: false }).toBuffer();
      const layers: sharp.OverlayOptions[] = [{ input: fg, gravity: "centre" }];
      if (logoLayer) layers.push({ input: logoLayer, top: H - 90, left: W - 300 });
      out = await sharp(bg).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    } else {
      throw new Error("no photo");
    }
  } catch {
    // Fallback: granatowa plansza z logo.
    const base = sharp({ create: { width: W, height: H, channels: 3, background: { r: 14, g: 23, b: 41 } } });
    const big = logo ? await sharp(logo).resize({ width: 640 }).png().toBuffer() : null;
    out = await (big ? base.composite([{ input: big, gravity: "centre" }]) : base).jpeg({ quality: 86 }).toBuffer();
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.end(out);
}
