// Integracja GlobKurier. Akcje: status | products | quote | track | label-options | buy-label | label.
// label-options/buy-label/label: dla SPRZEDAWCY Marketu — weryfikacja wlasnosci po e-mailu z JWT.
// buy-label: NAJPIERW obciaza portfel Sunrise Pay sprzedawcy (pay-charge), potem kupuje etykiete w GK;
// przy bledzie zakupu — automatyczny zwrot (pay-credit). Marza platformy: shipping_settings.margin_pct (12%).
// Sekrety: GLOBKURIER_EMAIL/PASSWORD/ENV, MYSUNRISE_PAY_BASE_URL, SUNRISE_MARKET_SERVICE_TOKEN.
//
// v9 (2026-08-11) — odpornosc, ZERO zmian w cenach i marzy:
//  * wpis w shipments zapisywany z kontrola bledu; gdy zapis padnie — glosny warning w odpowiedzi
//    i log (sprzedawca juz zaplacil i ma etykiete, wiec NIE cofamy platnosci, ale sygnalizujemy).
//  * pobranie etykiety dziala takze gdy GK nie zwrocil numeru (wyszukiwanie po gk_number LUB gk_hash
//    LUB id przesylki) — wczesniej etykieta oplacona bez numeru byla nie do pobrania.
//  * status wpisu 'created' tylko gdy mamy numer/hash; inaczej 'pending_gk' (widoczne w back office).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

const ENV = (Deno.env.get("GLOBKURIER_ENV") || "test").toLowerCase() === "prod" ? "prod" : "test";
const BASE = ENV === "prod" ? "https://api.globkurier.pl/v1" : "https://test.api.globkurier.pl/v1";
const GK_EMAIL = Deno.env.get("GLOBKURIER_EMAIL") || "";
const GK_PASSWORD = Deno.env.get("GLOBKURIER_PASSWORD") || "";
const LANG = { "Accept-Language": "pl" };
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
// Token serwisowy Sunrise Pay: z env, a gdy brak — z market.internal_secrets (klucz sunrise_pay_service_token).
// Bez literału w kodzie (repo jest publiczne) — 2026-09-05.
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const PAY_TOKEN = await resolveSunrisePayToken();
async function pay(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const r = await fetch(`${PAY_BASE}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN }, body: JSON.stringify(body) });
  let data: any = null; try { data = await r.json(); } catch { /* brak tresci */ }
  return { status: r.status, data };
}

let cached: { token: string; at: number } | null = null;
async function gkToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 20 * 60_000) return cached.token;
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", ...LANG }, body: JSON.stringify({ email: GK_EMAIL, password: GK_PASSWORD }) });
  if (!r.ok) throw new Error(`GlobKurier auth ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const token = j?.token || j?.data?.token;
  if (!token) throw new Error("GlobKurier: brak tokenu");
  cached = { token, at: Date.now() };
  return token;
}
async function gk(path: string, init: RequestInit = {}) {
  const token = await gkToken();
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...LANG, "x-auth-token": token, Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const text = await r.text();
  let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`GK ${path} ${r.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body as any;
}
function jwtEmail(req: Request): string {
  try {
    const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.email || "").toLowerCase();
  } catch { return ""; }
}
function flatProducts(out: any): any[] {
  if (Array.isArray(out)) return out;
  const cats = ["standard", "noon", "morning", "fast", "superfast"];
  const list: any[] = [];
  for (const c of cats) if (Array.isArray(out?.[c])) list.push(...out[c]);
  return list;
}
// Zbiera z dowolnego JSON adresy URL wygladajace na dokumenty (pdf/label/document/waybill)
function collectDocUrls(x: any, acc: string[] = []): string[] {
  if (typeof x === "string") {
    if (/^https?:\/\//i.test(x) && /(pdf|label|document|waybill|etykiet|list)/i.test(x)) acc.push(x);
  } else if (Array.isArray(x)) { for (const v of x) collectDocUrls(v, acc); }
  else if (x && typeof x === "object") { for (const v of Object.values(x)) collectDocUrls(v, acc); }
  return acc;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "market" } });
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "status");
    if (action === "status") return json({ ok: true, configured: !!(GK_EMAIL && GK_PASSWORD), env: ENV });
    if (!GK_EMAIL || !GK_PASSWORD) return json({ ok: false, error: "not_configured" }, 503);

    const { data: mrow } = await sb.from("shipping_settings").select("value").eq("key", "margin_pct").maybeSingle();
    const margin = Number(mrow?.value ?? 12);
    const withMargin = (n: number) => +(n * (1 + margin / 100)).toFixed(2);

    // Weryfikacja: zalogowany uzytkownik jest sprzedawca w tym zamowieniu
    async function sellerOrder(orderId: string) {
      const email = jwtEmail(req);
      if (!email) throw new Error("unauthorized");
      const { data: seller } = await sb.from("sellers").select("id, legal_name, email").eq("email", email).maybeSingle();
      if (!seller) throw new Error("not_a_seller");
      const { data: items } = await sb.from("order_items").select("id").eq("order_id", orderId).eq("seller_id", seller.id).limit(1);
      if (!items?.length) throw new Error("order_not_yours");
      const { data: order } = await sb.from("orders").select("id, ship_name, ship_phone, ship_street, ship_city, ship_postal, ship_country, status").eq("id", orderId).maybeSingle();
      if (!order) throw new Error("order_not_found");
      return { seller, order };
    }

    if (action === "products") {
      const out = await gk(`/products?${new URLSearchParams(b.params || {}).toString()}`);
      return json({ ok: true, env: ENV, products: out });
    }
    if (action === "quote") {
      const out = await gk(`/order/price?${new URLSearchParams(b.params || {}).toString()}`);
      const net = Number(out?.price?.gross ?? out?.gross ?? out?.price ?? 0);
      return json({ ok: true, env: ENV, gk: out, cost: net, price_for_seller: withMargin(net), margin_pct: margin });
    }
    if (action === "label-options") {
      const { order } = await sellerOrder(String(b.order_id || ""));
      const par = b.parcel || {};
      const qs = new URLSearchParams({
        length: String(par.length || 30), width: String(par.width || 20), height: String(par.height || 10),
        weight: String(par.weight || 1), quantity: "1", senderCountryId: "1", receiverCountryId: "1",
        ...(b.sender_postcode ? { senderPostCode: String(b.sender_postcode) } : {}),
        ...(order.ship_postal ? { receiverPostCode: String(order.ship_postal) } : {}),
      }).toString();
      const out = await gk(`/products?${qs}`);
      const options = flatProducts(out).map((p: any) => ({
        id: p.id, name: p.name, carrier: p.carrierName, gross: Number(p.grossPrice || 0),
        price_for_seller: withMargin(Number(p.grossPrice || 0)), delivery_days: p.averageDelivery ?? null, logo: p.carrierLogoLink || null,
      })).filter((o: any) => o.gross > 0).sort((a: any, b2: any) => a.price_for_seller - b2.price_for_seller);
      return json({ ok: true, options, receiver: { name: order.ship_name, city: order.ship_city, postal: order.ship_postal, street: order.ship_street }, margin_pct: margin });
    }
    if (action === "buy-label") {
      const { seller, order } = await sellerOrder(String(b.order_id || ""));
      const par = b.parcel || {}; const snd = b.sender || {};
      if (!snd.name || !snd.street || !snd.city || !snd.postCode || !snd.phone || !snd.email) return json({ ok: false, error: "sender_incomplete" }, 400);

      // 1) NIEZALEZNA wycena po stronie serwera (nie ufamy cenie z frontu)
      const qs = new URLSearchParams({
        length: String(par.length || 30), width: String(par.width || 20), height: String(par.height || 10),
        weight: String(par.weight || 1), quantity: "1", senderCountryId: "1", receiverCountryId: "1",
        ...(snd.postCode ? { senderPostCode: String(snd.postCode) } : {}),
        ...(order.ship_postal ? { receiverPostCode: String(order.ship_postal) } : {}),
      }).toString();
      const prods = flatProducts(await gk(`/products?${qs}`));
      const prod = prods.find((p: any) => String(p.id) === String(b.product_id));
      if (!prod) return json({ ok: false, error: "product_unavailable", message: "Wybrany przewoznik niedostepny dla tej paczki" }, 400);
      const quotedGross = Number(prod.grossPrice || 0);
      if (!(quotedGross > 0)) return json({ ok: false, error: "no_price" }, 400);
      const charge = withMargin(quotedGross);
      const chargeGrosz = Math.round(charge * 100);

      // 2) Obciazenie portfela Sunrise Pay sprzedawcy
      const idem = crypto.randomUUID();
      const ch = await pay("pay-charge", { user_ref: seller.email, amount_grosz: chargeGrosz, order_ref: `etykieta:${order.id}`, idempotency_key: idem });
      if (ch.status === 402 || (ch.data && ch.data.ok === false && ch.data.error === "insufficient_funds")) {
        const balGr = Number(ch.data?.balance_grosz ?? 0);
        return json({ ok: false, error: "insufficient_funds", message: `Za malo srodkow w portfelu Sunrise Pay (saldo ${(balGr / 100).toFixed(2)} zl, potrzeba ${charge.toFixed(2)} zl)`, balance: balGr / 100, required: charge }, 402);
      }
      if (ch.status !== 200 || !ch.data?.ok) {
        return json({ ok: false, error: "wallet_charge_failed", message: `Platnosc portfelem nieudana: ${ch.data?.message ?? ch.data?.error ?? ch.status}` }, 402);
      }

      // 3) Zakup etykiety w GlobKurier; przy bledzie — zwrot na portfel
      let paymentId = null as number | null;
      const { data: prow } = await sb.from("shipping_settings").select("value").eq("key", "gk_payment_id").maybeSingle();
      if (prow?.value) paymentId = Number(prow.value);
      if (!paymentId) {
        try { const pays = await gk(`/payments`); const first = (Array.isArray(pays) ? pays : pays?.data || [])[0]; paymentId = Number(first?.id) || null; } catch { paymentId = null; }
      }
      const payload: any = {
        shipment: { productId: Number(b.product_id), length: Number(par.length || 30), width: Number(par.width || 20), height: Number(par.height || 10), weight: Number(par.weight || 1), quantity: 1 },
        senderAddress: { name: snd.name, street: snd.street, city: snd.city, postCode: snd.postCode, countryId: 1, phone: snd.phone, email: snd.email },
        receiverAddress: { name: order.ship_name || "Odbiorca", street: order.ship_street || "", city: order.ship_city || "", postCode: order.ship_postal || "", countryId: 1, phone: order.ship_phone || "", email: b.receiver_email || GK_EMAIL },
        content: String(b.content || "Zamówienie Sunrise Market"),
        ...(paymentId ? { paymentId } : {}),
        collectionType: String(b.collection_type || "COURIER"),
      };
      let out: any;
      try {
        out = await gk(`/order`, { method: "POST", body: JSON.stringify(payload) });
      } catch (e) {
        await pay("pay-credit", { user_ref: seller.email, amount_grosz: chargeGrosz, reason: "Zwrot — nieudany zakup etykiety GlobKurier", order_ref: `etykieta:${order.id}`, idempotency_key: crypto.randomUUID() });
        return json({ ok: false, error: "gk_order_failed", message: `Zakup etykiety nieudany — srodki wrocily na portfel. (${String((e as Error).message).slice(0, 200)})` }, 502);
      }
      const net = Number(out?.price?.gross ?? quotedGross);
      const gkNumber = out?.number ? String(out.number) : null;
      const gkHash = out?.hash ? String(out.hash) : null;

      // 4) Wpis do shipments — z KONTROLA BLEDU. Sprzedawca juz zaplacil i ma etykiete,
      //    wiec platnosci NIE cofamy, ale musimy wiedziec, ze slad w bazie nie powstal.
      let shipmentId: string | null = null;
      let warning: string | null = null;
      const { data: insRow, error: insErr } = await sb.from("shipments").insert({
        order_id: order.id, seller_id: seller.id, gk_number: gkNumber, gk_hash: gkHash,
        product_id: String(b.product_id || ""), carrier: prod.carrierName || null,
        cost_net: net, price_charged: charge, margin_pct: margin,
        status: (gkNumber || gkHash) ? "created" : "pending_gk",
      }).select("id").single();
      if (insErr) {
        console.error("GK: zapis przesylki NIEUDANY", { order_id: order.id, seller_id: seller.id, gk_number: gkNumber, gk_hash: gkHash, charge, error: insErr.message });
        warning = "Etykieta zostala kupiona i oplacona, ale nie zapisala sie w bazie — zglos to obsludze (numer przesylki zapisz recznie).";
      } else {
        shipmentId = insRow?.id ?? null;
      }
      if (gkNumber) {
        const { error: updErr } = await sb.from("orders").update({ tracking_no: gkNumber }).eq("id", order.id);
        if (updErr) console.error("GK: zapis tracking_no nieudany", { order_id: order.id, error: updErr.message });
      }
      return json({ ok: true, gk: out, number: gkNumber, hash: gkHash, shipment_id: shipmentId, warning, price_for_seller: charge, paid_from_wallet: true, balance: Number(ch.data?.balance_grosz ?? 0) / 100 });
    }
    if (action === "label") {
      // Pobranie etykiety/dokumentow dla przesylki sprzedawcy.
      // Szukamy po numerze GK, hashu ALBO id przesylki — etykieta oplacona bez numeru
      // tez musi byc do pobrania.
      const email = jwtEmail(req);
      if (!email) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: seller } = await sb.from("sellers").select("id").eq("email", email).maybeSingle();
      if (!seller) return json({ ok: false, error: "not_a_seller" }, 403);
      const num = String(b.number || "").trim();
      const hash = String(b.hash || "").trim();
      const shipmentId = String(b.shipment_id || "").trim();

      let q = sb.from("shipments").select("id, gk_number, gk_hash, label_url").eq("seller_id", seller.id);
      if (shipmentId) q = q.eq("id", shipmentId);
      else if (num) q = q.eq("gk_number", num);
      else if (hash) q = q.eq("gk_hash", hash);
      else return json({ ok: false, error: "missing_identifier", message: "Podaj numer przesylki, hash albo shipment_id." }, 400);
      const { data: ship } = await q.maybeSingle();
      if (!ship) return json({ ok: false, error: "shipment_not_found" }, 404);
      if (!ship.gk_number && !ship.gk_hash) {
        return json({ ok: false, error: "no_gk_reference", message: "GlobKurier nie zwrocil jeszcze identyfikatora tej przesylki — sprobuj za chwile albo zglos obsludze." }, 409);
      }

      const qs = ship.gk_number ? `number=${encodeURIComponent(ship.gk_number)}` : `hash=${encodeURIComponent(ship.gk_hash || "")}`;
      const ord = await gk(`/order?${qs}`);
      // Uzupelnij brakujacy numer, jesli GK juz go nadal
      if (!ship.gk_number && ord?.number) {
        await sb.from("shipments").update({ gk_number: String(ord.number), status: "created", updated_at: new Date().toISOString() }).eq("id", ship.id);
        await sb.from("orders").update({ tracking_no: String(ord.number) }).eq("id", (await sb.from("shipments").select("order_id").eq("id", ship.id).maybeSingle()).data?.order_id ?? "");
      }
      const urls = collectDocUrls(ord);
      // Sprobuj pobrac pierwszy PDF przez API (z tokenem GK) i oddac jako base64
      for (const u of urls) {
        try {
          const token = await gkToken();
          const r = await fetch(u, { headers: { "x-auth-token": token, Authorization: `Bearer ${token}`, ...LANG } });
          if (r.ok && (r.headers.get("content-type") || "").includes("pdf")) {
            const buf = new Uint8Array(await r.arrayBuffer());
            let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            await sb.from("shipments").update({ label_url: u, updated_at: new Date().toISOString() }).eq("id", ship.id);
            return json({ ok: true, pdf_base64: btoa(bin), source: u });
          }
        } catch { /* sprobuj kolejny */ }
      }
      return json({ ok: true, pdf_base64: null, urls, gk: ord, note: urls.length ? "Nie udalo sie pobrac PDF przez API — sprobuj linkow." : "GK nie zwrocil jeszcze dokumentow dla tej przesylki (etykieta moze pojawic sie po chwili)." });
    }
    if (action === "track") {
      const qs = b.number ? `number=${encodeURIComponent(b.number)}` : `hash=${encodeURIComponent(b.hash || "")}`;
      const out = await gk(`/order?${qs}`);
      return json({ ok: true, gk: out });
    }
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
