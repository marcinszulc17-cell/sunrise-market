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
async function resolveStripeWebhookSecret(): Promise<string> {
  const env = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? Deno.env.get("STRIPE_WEBHOOK_SECRE") ?? "";
  if (/^whsec_/.test(env)) return env;
  return await readInternalSecret("stripe_webhook_secret");
}

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
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

function sbClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
}
function ok() {
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
async function pay(path: string, body: unknown) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const r = await fetch(`${PAY_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
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
async function settleSellerPayouts(sb: any, orderId: string) {
  const { data: booking } = await sb.from("bookings").select("ends_at").eq("order_id", orderId).maybeSingle();
  const { data: rows, error } = await sb.from("order_items")
    .select("seller_id,seller_payout,sellers!inner(email,seller_type)")
    .eq("order_id", orderId);
  if (error) throw error;

  // Cel wypłaty: zwykły sprzedawca -> portfel prywatny; Partner Handlowy (business) -> saldo firmowe (merchant).
  const grouped = new Map<string, { email: string; amount: number; target: "personal" | "merchant" }>();
  for (const row of rows ?? []) {
    const sellerId = String(row.seller_id ?? "");
    const email = String(row.sellers?.email ?? "").trim();
    if (!sellerId || !email) continue;
    const target: "personal" | "merchant" = String(row.sellers?.seller_type ?? "") === "business" ? "merchant" : "personal";
    const prev = grouped.get(sellerId) ?? { email, amount: 0, target };
    prev.amount = Math.round((prev.amount + Number(row.seller_payout ?? 0)) * 100) / 100;
    grouped.set(sellerId, prev);
  }

  for (const [sellerId, entry] of grouped.entries()) {
    if (entry.amount <= 0) continue;
    const { error: settlementError } = await sb.from("seller_settlements").upsert({
      order_id: orderId,
      seller_id: sellerId,
      seller_email: entry.email,
      amount: entry.amount,
      status: booking ? "scheduled" : "pending",
      available_at: booking?.ends_at ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id,seller_id", ignoreDuplicates: true });
    if (settlementError) throw settlementError;

    if (booking) continue;

    const idem = await uuidv5(`market:seller:${orderId}:${sellerId}`);
    const credited = await pay("pay-credit", {
      user_ref: entry.email,
      amount_grosz: Math.round(entry.amount * 100),
      reason: "Sprzedaż Sunrise Market",
      order_ref: orderId,
      idempotency_key: idem,
      target: entry.target,
    });
    const settled = credited.status === 200 && credited.data?.ok === true;
    const { error: updateError } = await sb.from("seller_settlements").update({
      status: settled ? "settled" : "failed",
      attempts: 1,
      mysunrise_tx_id: settled && credited.data?.tx_id ? String(credited.data.tx_id) : null,
      last_error: settled ? null : String(credited.data?.message ?? credited.data?.error ?? credited.status),
      settled_at: settled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId).eq("seller_id", sellerId);
    if (updateError) throw updateError;
    if (!settled) throw new Error(`MySunrise seller credit failed: ${credited.data?.message ?? credited.data?.error ?? credited.status}`);
  }
}
async function settleAmbassadorCommission(sb: any, orderId: string, email: string) {
  try {
    await sb.rpc("enqueue_ambassador_commission", { p_order: orderId });
    const { data: outbox, error } = await sb.from("ambassador_commission_outbox")
      .select("id,status,amount_net,attempts")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!outbox || ["sent", "pending_vat", "pending_identity", "reversed"].includes(String(outbox.status))) return;

    const amountNet = Math.round(Math.max(0, Number(outbox.amount_net ?? 0)) * 100) / 100;
    if (amountNet <= 0) return;
    const attempts = Number(outbox.attempts ?? 0) + 1;
    const now = new Date().toISOString();
    const referral = await pay("mkt-referral", {
      action: "sale",
      email,
      order_id: orderId,
      amount_net: amountNet,
      description: "Zakup prowizyjny w Sunrise Market (karta)",
    });
    const reason = String(referral.data?.reason ?? referral.data?.error ?? "");
    const noCommission = referral.status === 200 && referral.data?.ok === false && ["not_referred", "no_user", "zero_amount"].includes(reason);
    const settled = referral.status === 200 && referral.data?.ok === true;

    await sb.from("ambassador_commission_outbox").update({
      status: settled || noCommission ? "sent" : "failed",
      attempts,
      last_error: settled ? null : noCommission ? `not_applicable:${reason}` : String(referral.data?.error ?? referral.data?.reason ?? referral.status).slice(0, 1000),
      sent_at: settled || noCommission ? now : null,
      updated_at: now,
    }).eq("id", outbox.id).neq("status", "sent");
  } catch (e) {
    console.error("ambassador settlement failed", (e as Error).message);
    try {
      const { data: outbox } = await sb.from("ambassador_commission_outbox").select("id,attempts,status").eq("order_id", orderId).maybeSingle();
      if (outbox && outbox.status !== "reversed") await sb.from("ambassador_commission_outbox").update({
        status: "failed",
        attempts: Number(outbox.attempts ?? 0) + 1,
        last_error: String((e as Error).message ?? e).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", outbox.id).neq("status", "sent");
    } catch {}
  }
}
async function creditTopup(sb: any, s: any) {
  const topupId = String(s.metadata?.topup_id ?? "");
  const userId = String(s.metadata?.user_id ?? "");
  if (!topupId || !userId || s.payment_status !== "paid") return;

  const { data: topup, error: topupError } = await sb.from("wallet_topups")
    .select("id,user_id,amount,currency,status,stripe_session_id,credited,credit_attempts")
    .eq("id", topupId).single();
  if (topupError) throw topupError;
  if (topup.credited === true) return;
  if (String(topup.user_id) !== userId) throw new Error("Top-up user mismatch");
  if (topup.stripe_session_id && String(topup.stripe_session_id) !== String(s.id)) throw new Error("Top-up session mismatch");

  const amountGrosz = Math.round(Number(topup.amount) * 100);
  if (Number(s.amount_total) !== amountGrosz || String(s.currency ?? "").toLowerCase() !== String(topup.currency).toLowerCase()) {
    throw new Error("Top-up amount or currency mismatch");
  }

  let email = String(s.metadata?.user_email ?? s.customer_details?.email ?? s.customer_email ?? "").trim();
  if (!email) {
    const { data: authUser, error: authError } = await sb.auth.admin.getUserById(userId);
    if (authError) throw authError;
    email = String(authUser.user?.email ?? "").trim();
  }
  if (!email) throw new Error("Brak e-maila użytkownika dla doładowania Sunrise Pay");

  const attempts = Number(topup.credit_attempts ?? 0) + 1;
  const credited = await pay("pay-credit", {
    user_ref: email,
    amount_grosz: amountGrosz,
    reason: "Doładowanie Sunrise Pay",
    order_ref: `market-topup:${topupId}`,
    idempotency_key: topupId,
  });
  if (credited.status !== 200 || credited.data?.ok !== true) {
    const message = String(credited.data?.message ?? credited.data?.error ?? credited.status).slice(0, 1000);
    await sb.from("wallet_topups").update({
      status: "failed",
      credit_attempts: attempts,
      last_error: message,
      updated_at: new Date().toISOString(),
      stripe_payment_intent: s.payment_intent ?? null,
    }).eq("id", topupId);
    throw new Error(`MySunrise top-up credit failed: ${message}`);
  }

  const { error: updateError } = await sb.from("wallet_topups").update({
    status: "paid",
    credited: true,
    credit_attempts: attempts,
    last_error: null,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stripe_payment_intent: s.payment_intent ?? null,
  }).eq("id", topupId);
  if (updateError) throw updateError;
}
async function settleCardOrder(sb: any, s: any, stripe: any) {
  const orderId = s.metadata?.market_order_id;
  if (!orderId || s.payment_status !== "paid") return;
  const { data: ord, error: orderError } = await sb.from("orders")
    .select("id,status,coupon_code,discount_amount,cashback_amount,buyer_id,card_settlement_status")
    .eq("id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!ord || ord.card_settlement_status === "settled") return;

  const { data: claimed, error: claimError } = await sb.rpc("claim_stripe_order_settlement", {
    p_order_id: orderId,
    p_stripe_session_id: s.id,
  });
  if (claimError) throw claimError;
  if (claimed !== true) throw new Error("Stripe settlement is already processing");

  try {
    try {
      if (s.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(String(s.payment_intent), { expand: ["latest_charge.balance_transaction"] });
        const fee = pi?.latest_charge?.balance_transaction?.fee;
        if (typeof fee === "number" && fee >= 0) await sb.from("orders").update({ stripe_fee: Math.round(fee) / 100 }).eq("id", orderId);
      }
    } catch {}
    if (ord.coupon_code && Number(ord.discount_amount) > 0) {
      try { await sb.rpc("coupon_consume", { p_code: ord.coupon_code }); } catch {}
    }
    const { error: feeError } = await sb.rpc("apply_stripe_seller_fee", { p_order_id: orderId });
    if (feeError) throw feeError;
    if (s.metadata?.booking_id) {
      const { error: bookingError } = await sb.rpc("confirm_paid_booking", { p_order_id: orderId, p_payment_provider: "stripe" });
      if (bookingError) throw bookingError;
    }
    const email = String(s.metadata?.user_email ?? s.customer_details?.email ?? s.customer_email ?? "").trim();
    if (Number(ord.cashback_amount) > 0) {
      if (!email) throw new Error("Brak e-maila do naliczenia cashbacku");
      const pointsKey = await uuidv5(`market:points:${orderId}`);
      const points = await pay("pay-credit-points", {
        user_ref: email,
        points: Number(ord.cashback_amount),
        reason: "cashback",
        order_ref: orderId,
        idempotency_key: pointsKey,
      });
      if (points.status !== 200 || points.data?.ok !== true) throw new Error(`MySunrise cashback failed: ${points.data?.message ?? points.data?.error ?? points.status}`);
    }
    await settleSellerPayouts(sb, String(orderId));
    if (email) await settleAmbassadorCommission(sb, String(orderId), email);
    const now = new Date().toISOString();
    const { error: completedError } = await sb.from("orders").update({
      card_settlement_status: "settled",
      card_settlement_last_error: null,
      card_settlement_updated_at: now,
      card_settled_at: now,
    }).eq("id", orderId).eq("card_settlement_status", "processing");
    if (completedError) throw completedError;
    try { await sb.rpc("notify_order", { p_order: orderId }); } catch {}
  } catch (error) {
    const message = String((error as Error).message ?? error).slice(0, 1000);
    await sb.from("orders").update({
      card_settlement_status: "failed",
      card_settlement_last_error: message,
      card_settlement_updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("card_settlement_status", "processing");
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Brak podpisu", { status: 400 });
  const whsec = await resolveStripeWebhookSecret();
  if (!whsec) return new Response("Brak konfiguracji Stripe webhook", { status: 400 });

  const raw = await req.text();
  const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  let event: any;
  try { event = await stripe.webhooks.constructEventAsync(raw, sig, whsec); }
  catch (err) { return new Response(`Nieprawidłowy podpis: ${(err as Error).message}`, { status: 400 }); }

  const sb = sbClient();
  const { error: dupErr } = await sb.from("stripe_events").insert({ event_id: event.id, type: event.type });
  const eventInserted = !dupErr;
  if (dupErr) {
    if ((dupErr as any).code === "23505" && !["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return ok();
    if ((dupErr as any).code !== "23505") return new Response("DB error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        const topupId = s.metadata?.topup_id;
        if (topupId && s.payment_status === "paid") {
          await creditTopup(sb, s);
        } else if (s.metadata?.market_order_id) {
          await settleCardOrder(sb, s, stripe);
          // Sesja w trybie subscription: zapisujemy subskrypcję (odnowienia obsługuje invoice.paid).
          if (s.mode === "subscription" && s.subscription) {
            await sb.rpc("register_stripe_subscription", { p_order: s.metadata.market_order_id, p_stripe_subscription_id: String(s.subscription), p_stripe_customer_id: s.customer ? String(s.customer) : null });
          }
        }
        break;
      }
      case "invoice.paid": {
        // Odnowienie subskrypcji (kolejny miesiąc opłacony z góry) -> nowe opłacone zamówienie w Market,
        // z prowizją, wypłatą dla sprzedawcy i powiadomieniami jak przy zwykłym zakupie.
        const inv = event.data.object;
        const subId = inv.subscription ? String(inv.subscription) : "";
        if (subId && inv.billing_reason === "subscription_cycle") {
          const { data: renewalOrder, error: renewalError } = await sb.rpc("create_subscription_renewal_order", { p_stripe_subscription_id: subId, p_invoice_id: String(inv.id) });
          if (renewalError) throw renewalError;
          if (renewalOrder) {
            const orderId = String(renewalOrder);
            const { data: already } = await sb.from("orders").select("card_settlement_status").eq("id", orderId).maybeSingle();
            if (already?.card_settlement_status !== "settled") {
              const { error: feeError } = await sb.rpc("apply_stripe_seller_fee", { p_order_id: orderId });
              if (feeError) throw feeError;
              await settleSellerPayouts(sb, orderId);
              const now = new Date().toISOString();
              await sb.from("orders").update({ card_settlement_status: "settled", card_settled_at: now, card_settlement_updated_at: now, stripe_payment_intent: inv.payment_intent ? String(inv.payment_intent) : null }).eq("id", orderId);
              try { await sb.rpc("notify_order", { p_order: orderId }); } catch {}
            }
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await sb.rpc("cancel_stripe_subscription", { p_stripe_subscription_id: String(sub.id) });
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object;
        if (s.metadata?.topup_id) await sb.from("wallet_topups").update({ status: "expired" }).eq("id", s.metadata.topup_id);
        if (s.metadata?.booking_id && s.metadata?.market_order_id) {
          await sb.rpc("expire_booking_payment", { p_booking_id: s.metadata.booking_id, p_order_id: s.metadata.market_order_id });
        }
        break;
      }
      case "account.updated": {
        const a = event.data.object;
        const active = a.charges_enabled && a.payouts_enabled;
        await sb.from("sellers").update({ charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled, connect_status: active ? "active" : "restricted" }).eq("stripe_account_id", a.id);
        break;
      }
      case "transfer.created": {
        const tr = event.data.object;
        if (tr.metadata?.payout_run_id) await sb.rpc("mark_payout_paid", { p_run: tr.metadata.payout_run_id, p_transfer: tr.id });
        break;
      }
      default: break;
    }
    return ok();
  } catch (err) {
    if (eventInserted) await sb.from("stripe_events").delete().eq("event_id", event.id);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }
});