import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@16.12.0";

// Ochrona Kupujących Sunrise — zwrot pieniędzy kupującemu po sporze (tylko operator).
// Wejście: { dispute_id }. Stripe -> refunds.create(payment_intent); portfel -> pay-credit na e-mail kupującego.
// Po udanym zwrocie woła market.resolve_dispute(p_dispute,'refund') klientem serwisowym
// (status zamówienia 'cancelled', settlements 'cancelled', spór 'refunded'). Idempotentne.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

// Sekrety: najpierw env, potem market.internal_secrets (wzorzec z checkout).
async function readInternalSecret(key: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? ""; const k = SERVICE_KEY ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.${key}`, { headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []); return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
async function resolveStripeKey(): Promise<string> {
  const env = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (/^(sk|rk)_/.test(env)) return env;
  return await readInternalSecret("stripe_secret_key");
}
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  return await readInternalSecret("sunrise_pay_service_token");
}
async function uuidv5(name: string): Promise<string> {
  const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = (NS.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", new Uint8Array([...nsBytes, ...nameBytes])));
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
async function pay(token: string, path: string, body: unknown) {
  if (!token) throw new Error("Brak konfiguracji Sunrise Pay");
  const r = await fetch(`${PAY_BASE}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": token }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Brak autoryzacji" }, 401);
    const { data: isOp } = await userClient.rpc("is_operator");
    if (isOp !== true) return json({ error: "Tylko operator" }, 403);

    const { dispute_id } = await req.json().catch(() => ({}));
    if (typeof dispute_id !== "string" || !dispute_id) return json({ error: "Brak dispute_id" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
    const { data: dispute, error: dErr } = await sb.from("order_disputes").select("id,order_id,buyer_id,status").eq("id", dispute_id).maybeSingle();
    if (dErr) throw dErr;
    if (!dispute) return json({ error: "Spór nie istnieje" }, 404);
    if (dispute.status === "refunded") return json({ ok: true, already: true, status: "refunded" });
    if (dispute.status !== "open") return json({ error: `Spór jest już rozstrzygnięty (${dispute.status})` }, 409);

    const { data: order, error: oErr } = await sb.from("orders").select("id,status,total_gross,payment_provider,stripe_payment_intent,stripe_session_id,buyer_id,cashback_amount").eq("id", dispute.order_id).single();
    if (oErr) throw oErr;
    if (order.status === "cancelled") {
      await sb.rpc("resolve_dispute", { p_dispute: dispute_id, p_outcome: "refund", p_note: "Zamówienie było już anulowane" });
      return json({ ok: true, already: true, status: "refunded" });
    }
    if (order.status !== "disputed") return json({ error: `Zamówienie nie jest w sporze (${order.status})` }, 409);

    const amountGrosz = Math.round(Number(order.total_gross ?? 0) * 100);
    if (amountGrosz <= 0) return json({ error: "Kwota zamówienia jest zerowa" }, 400);

    const { data: buyer } = await sb.auth.admin.getUserById(String(order.buyer_id));
    const buyerEmail = String(buyer?.user?.email ?? "").trim();
    const idem = await uuidv5(`market:refund:${order.id}`);
    let externalRef: string | null = null;
    const provider = String(order.payment_provider ?? "");

    if (provider === "stripe") {
      const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      let paymentIntent = order.stripe_payment_intent ? String(order.stripe_payment_intent) : "";
      if (!paymentIntent && order.stripe_session_id && !String(order.stripe_session_id).startsWith("inv:")) {
        const session = await stripe.checkout.sessions.retrieve(String(order.stripe_session_id));
        paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? "");
      }
      if (!paymentIntent) return json({ error: "Brak płatności Stripe (payment_intent) do zwrotu" }, 400);
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntent, metadata: { order_id: order.id, dispute_id, kind: "buyer_protection_refund" } },
        { idempotencyKey: `market-refund:${order.id}` },
      );
      externalRef = refund.id;
    } else if (provider === "sunrise_pay") {
      if (!buyerEmail) return json({ error: "Brak e-maila kupującego do zwrotu na portfel" }, 400);
      const credited = await pay(await resolveSunrisePayToken(), "pay-credit", {
        user_ref: buyerEmail,
        amount_grosz: amountGrosz,
        reason: "Zwrot — Ochrona Kupujących Sunrise",
        order_ref: order.id,
        idempotency_key: idem,
      });
      if (credited.status !== 200 || credited.data?.ok !== true) return json({ error: `Zwrot na portfel nieudany: ${credited.data?.message ?? credited.data?.error ?? credited.status}` }, 502);
      externalRef = credited.data?.tx_id ? String(credited.data.tx_id) : null;
    } else {
      return json({ error: `Nieobsługiwana metoda płatności: ${provider || "brak"}` }, 400);
    }

    // Cofnięcie cashbacku: MySunrise `pay-debit-points` (ujemny wpis 'cashback_reversal', idempotentnie per zamówienie).
    // Nie blokuje zwrotu — pieniądze wracają zawsze; brak cofnięcia trafia do notatki sporu.
    let cashbackNote = "";
    if (Number(order.cashback_amount) > 0 && buyerEmail) {
      try {
        const debited = await pay(await resolveSunrisePayToken(), "pay-debit-points", { user_ref: buyerEmail, order_ref: order.id, reason: "refund_buyer_protection" });
        cashbackNote = debited.status === 200 && debited.data?.ok === true
          ? `, cofnięto cashback ${Number(debited.data?.reversed ?? 0)} pkt`
          : `, UWAGA: cashback ${order.cashback_amount} pkt nie cofnięty (${debited.data?.error ?? debited.status})`;
      } catch (e) { cashbackNote = `, UWAGA: cashback nie cofnięty (${String((e as Error).message ?? e)})`; }
    }

    const note = `Zwrot ${(amountGrosz / 100).toFixed(2)} zł (${provider}${externalRef ? `, ref ${externalRef}` : ""}${cashbackNote}) — operator ${user.email ?? user.id}`;
    const { data: resolved, error: rErr } = await sb.rpc("resolve_dispute", { p_dispute: dispute_id, p_outcome: "refund", p_note: note });
    if (rErr || resolved?.ok !== true) {
      return json({ ok: false, error: "refund_paid_finalize_pending", message: "Pieniądze zostały zwrócone, ale finalizacja sporu wymaga ponowienia. Nie wykonuj drugiego zwrotu.", external_ref: externalRef, detail: rErr?.message ?? resolved }, 500);
    }
    return json({ ok: true, status: "refunded", amount: amountGrosz / 100, provider, external_ref: externalRef });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
});
