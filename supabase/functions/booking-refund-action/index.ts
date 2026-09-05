import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

// Klucz Stripe: najpierw sekret środowiskowy, potem market.internal_secrets.
async function readInternalSecret(key: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? ""; const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.${key}`, { headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []); return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
// STRIPE_SECRET_KEY w env bywa błędny (2026-09-05: zawierał URL) — właściwy klucz jest w market.internal_secrets.
async function resolveStripeKey(): Promise<string> {
  const env = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (/^(sk|rk)_/.test(env)) return env;
  return await readInternalSecret("stripe_secret_key");
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
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
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function uuidv5(name: string): Promise<string> {
  const ns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = (ns.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const data = new Uint8Array([...nsBytes, ...Array.from(new TextEncoder().encode(name))]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
async function bridge(action: "reverse" | "restore", orderId: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji połączenia z MySunrise");
  const response = await fetch(`${PAY_BASE}/mkt-referral`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN }, body: JSON.stringify({ action, order_id: orderId }) });
  const data = await response.json().catch(() => ({})); return { response, data };
}
async function refundWallet(email: string, amountGrosz: number, orderId: string, bookingId: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const idem = await uuidv5(`market:booking-refund:${bookingId}:${orderId}`);
  const response = await fetch(`${PAY_BASE}/pay-credit`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN }, body: JSON.stringify({ user_ref: email, amount_grosz: amountGrosz, reason: "Zwrot opłaconej rezerwacji Sunrise Market", order_ref: orderId, idempotency_key: idem }) });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200 || data?.ok !== true) throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${response.status}`));
  return String(data?.tx_id ?? idem);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized", message: "Zaloguj się ponownie." }, 401);
  const body = await req.json().catch(() => ({})); const bookingId = String(body.booking_id ?? "").trim();
  if (!bookingId) return json({ ok: false, error: "booking_id_required" }, 400);
  const service = createClient(url, SERVICE_KEY!, { db: { schema: "market" } });
  let orderId = "", bonusesReversed = false, paymentRefunded = false;
  try {
    const { data: prepared, error: prepareError } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (prepareError) throw prepareError;
    const row = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!row) throw new Error("Nie udało się przygotować zwrotu rezerwacji");
    orderId = String(row.order_id);
    if (row.already_refunded === true) return json({ ok: true, already: true, booking_id: bookingId, order_id: orderId });
    const amountGrosz = Math.round(Number(row.amount_gross ?? 0) * 100); if (amountGrosz <= 0) throw new Error("Kwota zwrotu jest nieprawidłowa");
    const reversed = await bridge("reverse", orderId);
    if (reversed.response.status !== 200 || reversed.data?.ok !== true) {
      const reason = String(reversed.data?.reason ?? reversed.data?.error ?? "bonus_reversal_failed");
      const friendly = reason === "points_already_used" ? "Nie można wykonać automatycznego zwrotu, ponieważ część cashbacku lub prowizji z tej rezerwacji została już wykorzystana. Zwrot wymaga rozliczenia przez operatora." : "Nie udało się bezpiecznie cofnąć cashbacku i prowizji. Zwrot nie został wykonany.";
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: friendly, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: reason, message: friendly }, 409);
    }
    bonusesReversed = true;
    const { data: buyerData, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id)); const buyerEmail = buyerData.user?.email?.trim();
    if (buyerError || !buyerEmail) throw new Error("Nie znaleziono adresu e-mail kupującego do zwrotu");
    let externalRef = "";
    if (row.payment_provider === "sunrise_pay") externalRef = await refundWallet(buyerEmail, amountGrosz, orderId, bookingId);
    else if (row.payment_provider === "stripe") {
      if (!row.stripe_session_id) throw new Error("Brak sesji Stripe dla tej rezerwacji");
      const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id)); const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) throw new Error("Brak płatności Stripe do zwrotu");
      const refund = await stripe.refunds.create({ payment_intent: paymentIntent, amount: amountGrosz, metadata: { booking_id: bookingId, order_id: orderId, kind: "booking_full_refund" } }, { idempotencyKey: `market-booking-full-refund:${bookingId}` }); externalRef = refund.id;
    } else throw new Error("Nieobsługiwana metoda płatności");
    paymentRefunded = true;
    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef || null });
    if (finalizeError || finalized?.ok !== true) {
      const message = String(finalizeError?.message ?? finalized?.error ?? "Zwrot płatności wykonano, ale nie udało się domknąć statusu rezerwacji");
      await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef || null, last_error: message, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: "finalize_failed", message: "Pieniądze zostały zwrócone, ale status rezerwacji wymaga domknięcia przez operatora." }, 500);
    }
    return json({ ok: true, booking_id: bookingId, order_id: orderId, refunded: Number(row.amount_gross), payment_provider: row.payment_provider });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (bonusesReversed && !paymentRefunded && orderId) { try { await bridge("restore", orderId); } catch {} }
    try { await service.from("booking_refunds").update({ status: "payment_failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("booking_id", bookingId).neq("status", "refunded"); } catch {}
    return json({ ok: false, error: "refund_failed", message }, 400);
  }
});
