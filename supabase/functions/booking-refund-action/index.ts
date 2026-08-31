import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");

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
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function mySunrise(path: string, body: unknown) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji integracji MySunrise");
  const response = await fetch(`${PAY_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
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
    const { data, error } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Nie udało się przygotować zwrotu");
    orderId = String(row.order_id);
    if (row.already_refunded === true) return json({ ok: true, already: true, booking_id: bookingId, order_id: orderId, amount: Number(row.amount_gross || 0) });

    const amount = Number(row.amount_gross || 0);
    const amountGrosz = Math.round(amount * 100);
    if (amountGrosz <= 0) throw new Error("Kwota zwrotu jest nieprawidłowa");

    const buyer = await service.auth.admin.getUserById(String(row.buyer_id));
    const buyerEmail = buyer.data.user?.email?.trim();
    if (buyer.error || !buyerEmail) throw new Error("Brak adresu e-mail klienta do zwrotu");

    const reversed = await mySunrise("mkt-referral", { action: "reverse", order_id: orderId });
    if (!reversed.response.ok || reversed.data?.ok !== true) {
      const reason = String(reversed.data?.reason ?? reversed.data?.error ?? "bonus_reversal_failed");
      const detail = reason === "points_already_used"
        ? `Bonusy z tego zamówienia zostały już wykorzystane. Automatyczny zwrot jest zablokowany (wymagane ${reversed.data?.required ?? "?"} pkt, dostępne ${reversed.data?.available ?? "?"} pkt).`
        : `Nie udało się cofnąć bonusów: ${reason}`;
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: detail, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: detail, code: reason }, 409);
    }
    bonusesReversed = true;

    let externalRef = "";
    try {
      if (row.payment_provider === "sunrise_pay") {
        const idem = await uuidv5(`market:booking-refund:${orderId}`);
        const refund = await mySunrise("pay-credit", {
          user_ref: buyerEmail,
          amount_grosz: amountGrosz,
          reason: "Zwrot anulowanej rezerwacji Sunrise Market",
          order_ref: orderId,
          idempotency_key: idem,
        });
        if (!refund.response.ok || refund.data?.ok !== true) throw new Error(String(refund.data?.message ?? refund.data?.error ?? `Sunrise Pay ${refund.response.status}`));
        externalRef = String(refund.data?.tx_id ?? idem);
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
        }, { idempotencyKey: `market-booking-refund:${orderId}` });
        externalRef = refund.id;
      } else {
        throw new Error("Nieobsługiwana metoda płatności");
      }
    } catch (paymentError) {
      const restored = await mySunrise("mkt-referral", { action: "restore", order_id: orderId }).catch(() => null);
      const restoreFailed = !restored || !restored.response.ok || restored.data?.ok !== true;
      const message = `Zwrot płatności nie powiódł się: ${String((paymentError as Error).message ?? paymentError)}${restoreFailed ? ". Uwaga: automatyczne przywrócenie bonusów również wymaga kontroli operatora." : ""}`;
      await service.from("booking_refunds").update({ status: "payment_failed", last_error: message, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: message }, 502);
    }

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef || null });
    if (finalizeError || finalized?.ok !== true) {
      const message = `Płatność została zwrócona, ale finalizacja rezerwacji wymaga ponowienia: ${finalizeError?.message ?? finalized?.error ?? "unknown"}`;
      await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef || null, last_error: message, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      return json({ ok: false, error: message, payment_refunded: true }, 500);
    }

    return json({ ok: true, booking_id: bookingId, order_id: orderId, amount, payment_provider: row.payment_provider, external_ref: externalRef });
  } catch (error) {
    if (orderId && bonusesReversed) {
      // Only restore when money was not refunded. Errors after a successful payment refund
      // are handled above as finalize_failed and must never restore the bonuses.
      await mySunrise("mkt-referral", { action: "restore", order_id: orderId }).catch(() => null);
    }
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }
});
