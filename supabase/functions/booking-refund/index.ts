import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function uuidv5(name: string): Promise<string> {
  const ns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = (ns.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
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
  return { status: response.status, data };
}

async function payCredit(userRef: string, amountGrosz: number, orderId: string, bookingId: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const idem = await uuidv5(`market:booking-refund:${bookingId}`);
  const response = await fetch(`${PAY_BASE}/pay-credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({
      user_ref: userRef,
      amount_grosz: amountGrosz,
      reason: "Zwrot za anulowaną rezerwację Sunrise Market",
      order_ref: orderId,
      idempotency_key: idem,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200 || data?.ok !== true) {
    throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${response.status}`));
  }
  return String(data?.tx_id ?? idem);
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
  try {
    const { data: prepared, error: prepError } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (prepError) throw prepError;
    const row = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!row) throw new Error("Nie udało się przygotować zwrotu rezerwacji");
    if (row.already_refunded === true) return json({ ok: true, already: true, status: "refunded" });

    orderId = String(row.order_id);
    const amountGrosz = Math.round(Number(row.amount_gross ?? 0) * 100);
    if (amountGrosz <= 0) throw new Error("Nieprawidłowa kwota zwrotu");

    const reversed = await bridge("reverse", orderId);
    if (reversed.status !== 200 || reversed.data?.ok !== true) {
      const reason = String(reversed.data?.reason ?? reversed.data?.error ?? "bonus_reversal_failed");
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: reason, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (reason === "points_already_used") {
        return json({ ok: false, error: "bonus_already_used", message: "Nie można wykonać automatycznego zwrotu, ponieważ punkty z tej transakcji zostały już wykorzystane. Wymagane jest rozliczenie operatora." }, 409);
      }
      return json({ ok: false, error: "bonus_reversal_failed", message: "Nie udało się bezpiecznie cofnąć bonusów tej transakcji." }, 409);
    }
    bonusesReversed = true;

    let externalRef = "";
    if (row.payment_provider === "sunrise_pay") {
      const { data: buyerData, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id));
      if (buyerError || !buyerData.user?.email) throw new Error("Nie znaleziono e-maila kupującego do zwrotu Sunrise Pay");
      externalRef = await payCredit(buyerData.user.email, amountGrosz, orderId, bookingId);
    } else if (row.payment_provider === "stripe") {
      if (!row.stripe_session_id) throw new Error("Brak sesji Stripe dla tej rezerwacji");
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) throw new Error("Brak płatności Stripe do zwrotu");
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        amount: amountGrosz,
        metadata: { booking_id: bookingId, order_id: orderId, kind: "booking_full_refund" },
      }, { idempotencyKey: `booking-full-refund:${bookingId}` });
      externalRef = refund.id;
    } else {
      throw new Error("Nieobsługiwana metoda płatności");
    }

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef || null });
    if (finalizeError || finalized?.ok !== true) {
      await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef || null, last_error: finalizeError?.message ?? "finalize_failed", updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: "finalize_failed", payment_refunded: true, message: "Płatność została zwrócona, ale finalizacja statusu wymaga ponowienia przez operatora." }, 500);
    }

    return json({ ok: true, status: "refunded", amount: Number(row.amount_gross ?? 0), payment_provider: row.payment_provider });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (bonusesReversed && orderId) {
      const restored = await bridge("restore", orderId).catch(() => null);
      const restoreOk = restored?.status === 200 && restored?.data?.ok === true;
      await service.from("booking_refunds").update({
        status: "payment_failed",
        last_error: restoreOk ? message : `${message}; bonus_restore_failed`,
        updated_at: new Date().toISOString(),
      }).eq("booking_id", bookingId);
    }
    return json({ ok: false, error: "refund_failed", message }, 400);
  }
});