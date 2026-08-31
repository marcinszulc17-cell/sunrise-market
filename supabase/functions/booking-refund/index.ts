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
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const data = new Uint8Array([...nsBytes, ...nameBytes]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function bridge(path: string, body: unknown) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji integracji MySunrise");
  const response = await fetch(`${PAY_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.booking_id ?? "").trim();
  if (!bookingId) return json({ ok: false, error: "booking_id_required" }, 400);

  const service = createClient(url, SERVICE_KEY!, { db: { schema: "market" } });
  let orderId = "";
  let bonusesReversed = false;

  try {
    const { data, error } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Nie udało się przygotować zwrotu rezerwacji");
    orderId = String(row.order_id);
    if (row.already_refunded === true) return json({ ok: true, already: true, booking_id: bookingId, order_id: orderId });

    const { data: buyerData, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id));
    const buyerEmail = buyerData.user?.email?.trim();
    if (buyerError || !buyerEmail) throw new Error("Nie udało się ustalić adresu e-mail kupującego");

    const reverse = await bridge("mkt-referral", { action: "reverse", order_id: orderId });
    if (reverse.status !== 200 || reverse.data?.ok !== true) {
      const reason = String(reverse.data?.reason ?? reverse.data?.error ?? `MySunrise ${reverse.status}`);
      const message = reason === "points_already_used"
        ? "Nie można wykonać automatycznego zwrotu, ponieważ cashback lub prowizja z tego zamówienia została już wykorzystana. Wymagane jest rozliczenie przez operatora."
        : `Nie udało się cofnąć bonusów MySunrise: ${reason}`;
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: message, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: "bonus_reversal_blocked", message }, 409);
    }
    bonusesReversed = true;

    const amountGrosz = Math.round(Number(row.amount_gross ?? 0) * 100);
    if (amountGrosz <= 0) throw new Error("Kwota zwrotu jest nieprawidłowa");
    let externalRef: string | null = null;

    if (row.payment_provider === "sunrise_pay") {
      const idem = await uuidv5(`market:booking-refund:${bookingId}`);
      const refund = await bridge("pay-credit", {
        user_ref: buyerEmail,
        amount_grosz: amountGrosz,
        reason: "Zwrot opłaconej rezerwacji Sunrise Market",
        order_ref: orderId,
        idempotency_key: idem,
      });
      if (refund.status !== 200 || refund.data?.ok !== true) throw new Error(String(refund.data?.message ?? refund.data?.error ?? `Sunrise Pay ${refund.status}`));
      externalRef = refund.data?.tx_id ? String(refund.data.tx_id) : null;
    } else if (row.payment_provider === "stripe") {
      if (!row.stripe_session_id) throw new Error("Brak sesji Stripe dla tej rezerwacji");
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) throw new Error("Brak płatności Stripe do zwrotu");
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        amount: amountGrosz,
        metadata: { booking_id: bookingId, order_id: orderId, kind: "booking_refund" },
      }, { idempotencyKey: `booking-refund:${bookingId}` });
      externalRef = refund.id;
    } else {
      throw new Error("Nieobsługiwana metoda płatności");
    }

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef });
    if (finalizeError || finalized?.ok !== true) {
      const message = String(finalizeError?.message ?? finalized?.error ?? "Zwrot wykonany, ale nie udało się sfinalizować statusów");
      await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef, last_error: message, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: "finalize_failed", payment_refunded: true, message }, 500);
    }

    return json({ ok: true, booking_id: bookingId, order_id: orderId, amount: Number(row.amount_gross), payment_provider: row.payment_provider });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (bonusesReversed && orderId) {
      try { await bridge("mkt-referral", { action: "restore", order_id: orderId }); } catch {}
    }
    await service.from("booking_refunds").update({ status: "payment_failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("booking_id", bookingId).neq("status", "refunded");
    return json({ ok: false, error: "refund_failed", message }, 400);
  }
});
