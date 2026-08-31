import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function payCredit(userRef: string, amountGrosz: number, reason: string, orderRef: string, idem: string) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const response = await fetch(`${PAY_BASE}/pay-credit`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN }, body: JSON.stringify({ user_ref: userRef, amount_grosz: amountGrosz, reason, order_ref: orderRef, idempotency_key: idem }) });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200 || data?.ok !== true) throw new Error(String(data?.message ?? data?.error ?? `Sunrise Pay ${response.status}`));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.booking_id ?? "").trim();
  const action = body.action === "retain" ? "retain" : body.action === "refund" ? "refund" : "";
  const note = String(body.note ?? "").trim().slice(0, 1000) || null;
  if (!bookingId || !action) return json({ ok: false, error: "invalid_request" }, 400);
  const service = createClient(url, SERVICE_KEY!, { db: { schema: "market" } });
  try {
    const { data, error } = await userClient.rpc("seller_booking_deposit_prepare", { p_booking: bookingId, p_action: action });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Nie udało się przygotować rozliczenia kaucji");
    const amount = Number(row.deposit_gross ?? 0);
    const amountGrosz = Math.round(amount * 100);
    if (action === "refund") {
      if (row.payment_provider === "sunrise_pay") await payCredit(String(row.buyer_email), amountGrosz, "Zwrot kaucji Sunrise Market", String(row.order_id), `booking-deposit-refund:${bookingId}`);
      else if (row.payment_provider === "stripe") {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
        const session = await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (!paymentIntent) throw new Error("Brak płatności Stripe do zwrotu kaucji");
        await stripe.refunds.create({ payment_intent: paymentIntent, amount: amountGrosz, metadata: { booking_id: bookingId, kind: "deposit_refund" } }, { idempotencyKey: `booking-deposit-refund:${bookingId}` });
      } else throw new Error("Nieobsługiwana metoda płatności kaucji");
      const { error: finishError } = await service.from("bookings").update({ deposit_status: "refunded", deposit_resolved_at: new Date().toISOString(), deposit_retained_gross: 0, deposit_resolution_note: note, updated_at: new Date().toISOString() }).eq("id", bookingId).eq("deposit_status", "refunding");
      if (finishError) throw finishError;
      return json({ ok: true, action: "refund", deposit_status: "refunded", amount });
    }
    await payCredit(String(row.seller_email), amountGrosz, "Zatrzymana kaucja Sunrise Market", String(row.order_id), `booking-deposit-retain:${bookingId}`);
    const { error: finishError } = await service.from("bookings").update({ deposit_status: "retained", deposit_resolved_at: new Date().toISOString(), deposit_retained_gross: amount, deposit_resolution_note: note, updated_at: new Date().toISOString() }).eq("id", bookingId).eq("deposit_status", "retaining");
    if (finishError) throw finishError;
    return json({ ok: true, action: "retain", deposit_status: "retained", amount });
  } catch (error) {
    await service.from("bookings").update({ deposit_status: "failed", deposit_resolution_note: String((error as Error).message ?? error).slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", bookingId).in("deposit_status", ["refunding", "retaining"]);
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }
});
