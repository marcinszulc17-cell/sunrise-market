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
  const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = (NS.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const data = new Uint8Array([...nsBytes, ...nameBytes]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function mySunrise(action: "reverse" | "restore", orderId: string) {
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
  const idempotencyKey = await uuidv5(`booking-refund:${bookingId}`);
  const response = await fetch(`${PAY_BASE}/pay-credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({
      user_ref: userRef,
      amount_grosz: amountGrosz,
      reason: "Zwrot anulowanej rezerwacji Sunrise Market",
      order_ref: orderId,
      idempotency_key: idempotencyKey,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200 || data?.ok !== true) {
    throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${response.status}`));
  }
  return String(data?.tx_id ?? idempotencyKey);
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
    const { data: prepared, error: prepareError } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (prepareError) throw prepareError;
    const row = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!row) throw new Error("Nie udało się przygotować zwrotu rezerwacji");
    if (row.already_refunded === true) return json({ ok: true, already: true, amount: Number(row.amount_gross ?? 0) });

    orderId = String(row.order_id);
    const amount = Number(row.amount_gross ?? 0);
    const amountGrosz = Math.round(amount * 100);
    if (!Number.isFinite(amountGrosz) || amountGrosz <= 0) throw new Error("Nieprawidłowa kwota zwrotu");

    const { data: buyer, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id));
    const buyerEmail = buyer.user?.email?.trim();
    if (buyerError || !buyerEmail) throw new Error("Nie znaleziono e-maila kupującego");

    const reversal = await mySunrise("reverse", orderId);
    if (reversal.status !== 200 || reversal.data?.ok !== true) {
      const reason = String(reversal.data?.reason ?? reversal.data?.error ?? "bonus_reversal_failed");
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: reason, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (reason === "points_already_used") {
        return json({ ok: false, error: "points_already_used", message: "Nie można wykonać automatycznego zwrotu, ponieważ punkty z tej rezerwacji zostały już wykorzystane. Wymagane jest rozliczenie operatora." }, 409);
      }
      return json({ ok: false, error: reason, message: "Nie udało się bezpiecznie cofnąć cashbacku i prowizji." }, 409);
    }
    bonusesReversed = true;

    let externalRef = "";
    try {
      if (row.payment_provider === "sunrise_pay") {
        externalRef = await payCredit(buyerEmail, amountGrosz, orderId, bookingId);
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
        }, { idempotencyKey: `booking-refund:${bookingId}` });
        externalRef = refund.id;
      } else {
        throw new Error("Nieobsługiwana metoda płatności");
      }
    } catch (paymentError) {
      const restore = await mySunrise("restore", orderId).catch(() => ({ status: 500, data: { ok: false } }));
      bonusesReversed = !(restore.status === 200 && restore.data?.ok === true);
      await service.from("booking_refunds").update({
        status: "payment_failed",
        last_error: String((paymentError as Error).message ?? paymentError).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("booking_id", bookingId);
      return json({ ok: false, error: "payment_refund_failed", bonuses_restored: !bonusesReversed, message: "Zwrot płatności nie powiódł się. Rezerwacja pozostała aktywna." }, 400);
    }

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", {
      p_booking: bookingId,
      p_external_ref: externalRef || null,
    });
    if (finalizeError || finalized?.ok !== true) {
      await service.from("booking_refunds").update({
        status: "finalize_failed",
        external_ref: externalRef || null,
        last_error: String(finalizeError?.message ?? finalized?.error ?? "finalize_failed").slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("booking_id", bookingId);
      return json({ ok: false, error: "finalize_failed", payment_refunded: true, message: "Płatność została zwrócona, ale finalizacja statusu wymaga interwencji operatora." }, 500);
    }

    return json({ ok: true, booking_id: bookingId, order_id: orderId, amount, external_ref: externalRef });
  } catch (error) {
    if (orderId && bonusesReversed) {
      await mySunrise("restore", orderId).catch(() => null);
    }
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }
});