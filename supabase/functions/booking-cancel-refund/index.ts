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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
// Token serwisowy Sunrise Pay: najpierw sekret środowiskowy, potem market.internal_secrets.
// Fallback dodany 2026-09-05 — sekret SUNRISE_MARKET_SERVICE_TOKEN nie był ustawiony w projekcie,
// przez co portfel, checkout portfelem i wypłaty sprzedawców zwracały "Brak konfiguracji Sunrise Pay".
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const PAY_TOKEN = await resolveSunrisePayToken();
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function uuidv5(name: string): Promise<string> {
  const NS = "6ba7b810-9dad-11d1-80b4-00f048300c8";
  const nsBytes = (NS.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const data = new Uint8Array([...nsBytes, ...Array.from(new TextEncoder().encode(name))]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function bridge(action: "reverse" | "restore", orderId: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji integracji MySunrise");
  const response = await fetch(`${PAY_BASE}/mkt-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({ action, order_id: orderId }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok === true, status: response.status, data };
}

async function payCredit(userRef: string, amountGrosz: number, orderId: string, idem: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const response = await fetch(`${PAY_BASE}/pay-credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({ user_ref: userRef, amount_grosz: amountGrosz, reason: "Zwrot za anulowaną rezerwację Sunrise Market", order_ref: orderId, idempotency_key: idem }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${response.status}`));
  return data;
}

async function abortRefund(service: any, bookingId: string, message: string) {
  if (!bookingId) return;
  const { error } = await service.rpc("booking_refund_abort", { p_booking: bookingId, p_error: message.slice(0, 1000) });
  if (error) console.error("booking refund abort failed", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
  const service = createClient(url, SERVICE_KEY!, { db: { schema: "market" } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.booking_id ?? "").trim();
  if (!bookingId) return json({ ok: false, error: "booking_id_required" }, 400);

  let orderId = "";
  let bonusesReversed = false;
  let paymentRefunded = false;
  try {
    const { data: prepared, error: prepareError } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (prepareError) throw prepareError;
    const row = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!row) throw new Error("Nie udało się przygotować zwrotu");
    orderId = String(row.order_id);
    if (row.already_refunded === true) return json({ ok: true, already: true, booking_id: bookingId, order_id: orderId });

    const { data: buyerData, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id));
    if (buyerError || !buyerData.user?.email) throw new Error("Nie znaleziono konta kupującego do zwrotu");
    const buyerEmail = buyerData.user.email;

    const reversal = await bridge("reverse", orderId);
    if (!reversal.ok) {
      const reason = String(reversal.data?.reason ?? reversal.data?.error ?? "bonus_reversal_failed");
      await abortRefund(service, bookingId, reason);
      if (reason === "points_already_used") return json({ ok: false, error: "bonus_points_already_used", message: "Nie można automatycznie anulować tej opłaconej rezerwacji, ponieważ część punktów cashback/prowizji została już wykorzystana. Wymagane jest rozliczenie operatora." }, 409);
      throw new Error(`Nie udało się cofnąć bonusów: ${reason}`);
    }
    bonusesReversed = true;

    const { error: reversalStateError } = await service.from("booking_refunds").update({
      status: "bonuses_reversed",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("booking_id", bookingId);
    if (reversalStateError) throw reversalStateError;

    const amount = Number(row.amount_gross ?? 0);
    const amountGrosz = Math.round(amount * 100);
    if (amountGrosz <= 0) throw new Error("Nieprawidłowa kwota zwrotu");

    let externalRef = "";
    if (row.payment_provider === "sunrise_pay") {
      const credited = await payCredit(buyerEmail, amountGrosz, orderId, await uuidv5(`booking-full-refund:${bookingId}`));
      externalRef = String(credited.tx_id ?? "");
      paymentRefunded = true;
    } else if (row.payment_provider === "stripe") {
      if (!row.stripe_session_id) throw new Error("Brak sesji Stripe dla rezerwacji");
      const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) throw new Error("Brak płatności Stripe do zwrotu");
      const refund = await stripe.refunds.create({ payment_intent: paymentIntent, amount: amountGrosz, metadata: { booking_id: bookingId, order_id: orderId, kind: "booking_full_refund" } }, { idempotencyKey: `booking-full-refund:${bookingId}` });
      externalRef = refund.id;
      paymentRefunded = true;
    } else throw new Error("Nieobsługiwana metoda płatności");

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef });
    if (finalizeError || finalized?.ok !== true) {
      await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef || null, last_error: String(finalizeError?.message ?? "finalize_failed"), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: "refund_paid_finalize_pending", message: "Płatność została zwrócona, ale finalizacja statusu rezerwacji wymaga ponowienia. Nie wykonuj drugiego ręcznego zwrotu." }, 500);
    }
    return json({ ok: true, booking_id: bookingId, order_id: orderId, refunded: amount, payment_provider: row.payment_provider });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (bonusesReversed && !paymentRefunded && orderId) { try { await bridge("restore", orderId); } catch {} }
    if (!paymentRefunded) await abortRefund(service, bookingId, message);
    return json({ ok: false, error: message }, 400);
  }
});