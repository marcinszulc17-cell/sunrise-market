// Podgląd ogłoszenia przy udostępnianiu linku (WhatsApp, Messenger, Facebook, X, LinkedIn, Telegram, iMessage…).
// Sklep jest aplikacją React, więc roboty budujące miniaturki nie wykonują JS i widziały zawsze ogólny tytuł
// i obrazek Sunrise Market. vercel.json kieruje TYLKO roboty (po User-Agent) z /produkt/:id tutaj; ludzie dostają
// normalną aplikację. Zwracamy lekki HTML z og:* / twitter:* dla KONKRETNEGO ogłoszenia + link do strony.
export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://ihehncaaokbwbdqdztna.supabase.co";
// Klucz anon jest publiczny (ten sam trafia do przeglądarki) — fallback, gdy env edge nie ma VITE_*.
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZWhuY2Fhb2tid2JkcWR6dG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUyMDMsImV4cCI6MjA5NzY2MTIwM30.jZCKRCmzNRymVoeSJfXuL6v3qemE8NfV5qmNvpFjqi8";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function plain(s: unknown, max = 200) {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/[#*_`\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function zl(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const pageUrl = `${origin}/produkt/${id}`;
  const fallback = { title: "Sunrise Market — marketplace ekosystemu Sunrise", description: "Płać portfelem Sunrise Pay, odbieraj 3% cashbacku i kupuj od zweryfikowanych sprzedawców.", image: `${origin}/api/og-image`, price: "" };
  let meta = { ...fallback };

  if (/^[0-9a-f-]{36}$/i.test(id) && ANON) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_offer`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "Content-Profile": "market", "Accept-Profile": "market" },
        body: JSON.stringify({ p_id: id }),
      });
      const rows = await r.json().catch(() => []);
      const o = Array.isArray(rows) ? rows[0] : null;
      if (o?.title) {
        const price = Number(o.price_gross ?? 0);
        const sub = o.attributes?.subscription ? " / mies." : "";
        const img = String(o.image_url ?? "");
        meta = {
          title: `${o.title} — ${price > 0 ? zl(price) + sub : "Sunrise Market"}`,
          description: plain(o.description) || `${o.category ?? "Oferta"} · ${o.seller ?? "Sunrise Market"} · cashback 3% na portfel Sunrise Pay`,
          // Zawsze JPEG 1200×630 z /api/og-image (komunikatory pomijają WebP/HEIC/SVG i małe miniatury).
          image: `${origin}/api/og-image?id=${id}`,
          price: price > 0 ? String(price) : "",
        };
      }
    } catch { /* zostaje fallback */ }
  }

  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Sunrise Market">
<meta property="og:locale" content="pl_PL">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:image" content="${esc(meta.image)}">
<meta property="og:image:secure_url" content="${esc(meta.image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(meta.title)}">
${meta.price ? `<meta property="product:price:amount" content="${esc(meta.price)}"><meta property="product:price:currency" content="PLN">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${esc(meta.image)}">
</head><body><p><a href="${esc(pageUrl)}">${esc(meta.title)}</a></p></body></html>`;

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=600" } });
}
