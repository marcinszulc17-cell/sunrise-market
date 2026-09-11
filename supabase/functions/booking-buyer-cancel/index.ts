// booking-buyer-cancel — anulowanie rezerwacji przez GOŚCIA, zgodnie z polityką
// anulowania wybraną przez właściciela obiektu.
//
// Różnica wobec booking-cancel-refund (anulowanie przez sprzedawcę, zawsze 100%):
// tutaj kwota zwrotu wynika z market.booking_cancellation_quote, więc może być
// częściowa. Zatrzymana część czynszu zostaje u właściciela, a jego wypłata jest
// pomniejszana proporcjonalnie — razem z naszą prowizją.
//
// Kaucja wraca zawsze: nie jest karą za anulowanie, tylko zabezpieczeniem pobytu,
// który się nie odbędzie. Cashback i prowizja ambasadorska są cofane w całości,
// bo pobytu nie było.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@16.12.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");

async function readInternalSecret(key: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const k = SERVICE_KEY ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.${key}`, {
      headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "market" },
    });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
async function resolveStripeKey(): Promise<string> {
  const env = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (/^(sk|rk)_/.test(env)) return env;
  return await readInternalSecret("stripe_secret_key");
}
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN") || await readInternalSecret("sunrise_pay_service_token");

async function uuidv5(name: string): Promise<string> {
  const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
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
  const r = await fetch(`${PAY_BASE}/mkt-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({ action, order_id: orderId }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok && data?.ok === true, data };
}

async function payCredit(userRef: string, amountGrosz: number, orderId: string, idem: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const r = await fetch(`${PAY_BASE}/pay-credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify({
      user_ref: userRef, amount_grosz: amountGrosz,
      reason: "Zwrot za anulowaną rezerwację Sunrise Market", order_ref: orderId, idempotency_key: idem,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok !== true) throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${r.status}`));
  return data;
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

  const body = await req.json().catch(() => ({} as any));
  const bookingId = String(body.booking_id ?? "").trim();
  if (!bookingId) return json({ ok: false, error: "booking_id_required" }, 400);

  let orderId = "";
  let bonusesReversed = false;
  let paymentRefunded = false;
  try {
    // Uprawnienia i kwotę liczy baza — tokenem gościa, więc cudzej rezerwacji nie ruszy.
    const { data: prepared, error: prepareError } = await userClient.rpc("buyer_booking_cancel_prepare", { p_booking: bookingId });
    if (prepareError) throw prepareError;
    const row = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!row) throw new Error("Nie udało się przygotować anulowania");
    orderId = String(row.order_id);
    if (row.already_refunded === true) {
      return json({ ok: true, already: true, booking_id: bookingId, order_id: orderId, refunded: Number(row.amount_gross ?? 0) });
    }

    const { data: buyerData, error: buyerError } = await service.auth.admin.getUserById(String(row.buyer_id));
    if (buyerError || !buyerData.user?.email) throw new Error("Nie znaleziono konta do zwrotu");
    const buyerEmail = buyerData.user.email;

    const reversal = await bridge("reverse", orderId);
    if (!reversal.ok) {
      const reason = String(reversal.data?.reason ?? reversal.data?.error ?? "bonus_reversal_failed");
      await service.rpc("booking_refund_abort", { p_booking: bookingId, p_error: reason.slice(0, 1000) });
      if (reason === "points_already_used") {
        return json({
          ok: false, error: "bonus_points_already_used",
          message: "Część cashbacku z tej rezerwacji została już wydana, więc nie możemy anulować jej automatycznie. Napisz do nas — rozliczymy to ręcznie.",
        }, 409);
      }
      throw new Error(`Nie udało się cofnąć bonusów: ${reason}`);
    }
    bonusesReversed = true;

    await service.from("booking_refunds").update({ status: "bonuses_reversed", last_error: null, updated_at: new Date().toISOString() }).eq("booking_id", bookingId);

    const amount = Number(row.amount_gross ?? 0);
    const amountGrosz = Math.round(amount * 100);
    if (amountGrosz <= 0) throw new Error("Nieprawidłowa kwota zwrotu");

    let externalRef = "";
    if (row.payment_provider === "sunrise_pay") {
      const credited = await payCredit(buyerEmail, amountGrosz, orderId, await uuidv5(`booking-buyer-cancel:${bookingId}`));
      externalRef = String(credited.tx_id ?? "");
      paymentRefunded = true;
    } else if (row.payment_provider === "stripe") {
      if (!row.stripe_session_id) throw new Error("Brak sesji Stripe dla rezerwacji");
      const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!pi) throw new Error("Brak płatności Stripe do zwrotu");
      const refund = await stripe.refunds.create(
        { payment_intent: pi, amount: amountGrosz, metadata: { booking_id: bookingId, order_id: orderId, kind: "booking_buyer_cancel" } },
        { idempotencyKey: `booking-buyer-cancel:${bookingId}` },
      );
      externalRef = refund.id;
      paymentRefunded = true;
    } else throw new Error("Nieobsługiwana metoda płatności");

    const { data: finalized, error: finalizeError } = await service.rpc("booking_refund_finalize_partial", {
      p_booking: bookingId, p_external_ref: externalRef, p_retained_rent: Number(row.retained_rent ?? 0),
    });
    if (finalizeError || finalized?.ok !== true) {
      await service.from("booking_refunds").update({
        status: "finalize_failed", external_ref: externalRef || null,
        last_error: String(finalizeError?.message ?? "finalize_failed"), updated_at: new Date().toISOString(),
      }).eq("booking_id", bookingId);
      return json({
        ok: false, error: "refund_paid_finalize_pending",
        message: "Pieniądze zostały zwrócone, ale zamknięcie rezerwacji wymaga ponowienia. Nie anuluj drugi raz — zajmiemy się tym.",
      }, 500);
    }

    return json({
      ok: true, booking_id: bookingId, order_id: orderId,
      refunded: amount, refund_pct: Number(row.refund_pct ?? 0),
      retained_rent: Number(row.retained_rent ?? 0), payment_provider: row.payment_provider,
    });
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (bonusesReversed && !paymentRefunded && orderId) { try { await bridge("restore", orderId); } catch { /* przywrócenie bonusów zrobi operator */ } }
    if (!paymentRefunded) {
      try { await service.rpc("booking_refund_abort", { p_booking: bookingId, p_error: message.slice(0, 1000) }); } catch { /* status zostanie odblokowany ręcznie */ }
    }
    return json({ ok: false, error: message }, 400);
  }
});
