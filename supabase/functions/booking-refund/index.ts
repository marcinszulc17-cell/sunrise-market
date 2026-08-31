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
  const NS = "6ba7b810-9dad-11d1-80b4-00f048300c8";
  const nsBytes = (NS.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const data = new Uint8Array([...nsBytes, ...nameBytes]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function callMySunrise(path: string, body: unknown) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
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

  let row: any = null;
  try {
    const { data, error } = await userClient.rpc("seller_booking_refund_prepare", { p_booking: bookingId });
    if (error) throw error;
    row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Nie udało się przygotować zwrotu rezerwacji");
    if (row.already_refunded) return json({ ok: true, already: true, booking_id: bookingId, order_id: row.order_id });
  } catch (error) {
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }

  const orderId = String(row.order_id);
  const amount = Number(row.amount_gross ?? 0);
  const amountGrosz = Math.round(amount * 100);
  if (amountGrosz <= 0) return json({ ok: false, error: "Nieprawidłowa kwota zwrotu" }, 400);

  try {
    const reversed = await callMySunrise("mkt-referral", { action: "reverse", order_id: orderId });
    if (reversed.response.status !== 200 || reversed.data?.ok !== true) {
      const reason = String(reversed.data?.reason ?? reversed.data?.error ?? `MySunrise ${reversed.response.status}`);
      await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: reason.slice(0, 1000), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
      if (reason === "points_already_used") {
        return json({ ok: false, error: "Nie można automatycznie zwrócić rezerwacji, ponieważ część cashbacku lub prowizji została już wykorzystana. Wymagane rozliczenie operatora." }, 409);
      }
      return json({ ok: false, error: `Nie udało się cofnąć bonusów: ${reason}` }, 409);
    }
  } catch (error) {
    const reason = String((error as Error).message ?? error);
    await service.from("booking_refunds").update({ status: "blocked_bonus", last_error: reason.slice(0, 1000), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
    return json({ ok: false, error: "Nie udało się bezpiecznie przygotować zwrotu bonusów." }, 502);
  }

  let externalRef: string | null = null;
  try {
    if (row.payment_provider === "sunrise_pay") {
      const idem = await uuidv5(`booking-refund:${bookingId}`);
      const credited = await callMySunrise("pay-credit", {
        user_ref: String(row.buyer_email),
        amount_grosz: amountGrosz,
        reason: "Zwrot opłaconej rezerwacji Sunrise Market",
        order_ref: orderId,
        idempotency_key: idem,
      });
      if (credited.response.status !== 200 || credited.data?.ok !== true) {
        throw new Error(String(credited.data?.message ?? credited.data?.error ?? `Sunrise Pay ${credited.response.status}`));
      }
      externalRef = credited.data?.tx_id ? String(credited.data.tx_id) : idem;
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
    let restoreError: string | null = null;
    try {
      const restored = await callMySunrise("mkt-referral", { action: "restore", order_id: orderId });
      if (restored.response.status !== 200 || restored.data?.ok !== true) restoreError = String(restored.data?.error ?? restored.data?.reason ?? restored.response.status);
    } catch (error) {
      restoreError = String((error as Error).message ?? error);
    }
    const reason = String((paymentError as Error).message ?? paymentError);
    await service.from("booking_refunds").update({
      status: "payment_failed",
      last_error: `${reason}${restoreError ? ` | restore: ${restoreError}` : ""}`.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("booking_id", bookingId);
    return json({ ok: false, error: "Zwrot płatności nie powiódł się. Rezerwacja pozostała aktywna, a bonusy zostały przywrócone." }, 502);
  }

  try {
    const { data, error } = await service.rpc("booking_refund_finalize", { p_booking: bookingId, p_external_ref: externalRef });
    if (error) throw error;
    return json({ ok: true, booking_id: bookingId, order_id: orderId, amount, refund: data });
  } catch (finalizeError) {
    const reason = String((finalizeError as Error).message ?? finalizeError);
    await service.from("booking_refunds").update({ status: "finalize_failed", external_ref: externalRef, last_error: reason.slice(0, 1000), updated_at: new Date().toISOString() }).eq("booking_id", bookingId);
    return json({ ok: false, error: "Płatność została zwrócona i bonusy cofnięte, ale finalizacja statusu wymaga ponowienia przez operatora." }, 500);
  }
});