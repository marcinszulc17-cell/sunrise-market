import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");

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
  const { data: rows, error } = await sb.from("order_items")
    .select("seller_id,seller_payout,sellers!inner(email)")
    .eq("order_id", orderId);
  if (error) throw error;

  const grouped = new Map<string, { email: string; amount: number }>();
  for (const row of rows ?? []) {
    const sellerId = String(row.seller_id ?? "");
    const email = String(row.sellers?.email ?? "").trim();
    if (!sellerId || !email) continue;
    const prev = grouped.get(sellerId) ?? { email, amount: 0 };
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
      status: "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id,seller_id", ignoreDuplicates: true });
    if (settlementError) throw settlementError;

    const idem = await uuidv5(`market:seller:${orderId}:${sellerId}`);
    const credited = await pay("pay-credit", {
      user_ref: entry.email,
      amount_grosz: Math.round(entry.amount * 100),
      reason: "Sprzedaż Sunrise Market",
      order_ref: orderId,
      idempotency_key: idem,
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
  }
}
// Legacy top-up flow is intentionally preserved in this PR. Moving card top-ups
// to the authoritative MySunrise wallet is the next, separately reviewed change.
async function creditTopup(sb: any, args: { userId: string; topupId: string; amount: number; currency: string }) {
  const provider = (Deno.env.get("WALLET_PROVIDER") ?? "mirror").toLowerCase();
  if (provider === "mysunrise") {
    const base = Deno.env.get("MYSUNRISE_API_URL");
    const key = Deno.env.get("MYSUNRISE_API_KEY");
    if (!base || !key) throw new Error("WALLET_PROVIDER=mysunrise bez MYSUNRISE_API_URL/KEY");
    const res = await fetch(`${base}/wallets/${args.userId}/credit`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": args.topupId },
      body: JSON.stringify({ amount: args.amount, currency: args.currency, source: "market_topup", ref: args.topupId }),
    });
    if (!res.ok) throw new Error(`MySunrise credit ${res.status}: ${await res.text()}`);
    return Number((await res.json()).balance);
  }
  const { data, error } = await sb.rpc("credit_topup", { p_topup_id: args.topupId });
  if (error) throw error;
  return Number(data);
}
async function settleCardOrder(sb: any, s: any, stripe: any) {
  const orderId = s.metadata?.market_order_id;
  if (!orderId || s.payment_status !== "paid") return;
  const { data: ord } = await sb.from("orders").select("id,status,coupon_code,discount_amount,buyer_id").eq("id", orderId).maybeSingle();
  if (!ord || ord.status === "paid") return;

  await sb.from("orders").update({ status: "paid", payment_provider: "stripe", stripe_session_id: s.id }).eq("id", orderId);
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
  try { await settleSellerPayouts(sb, String(orderId)); } catch (e) { console.error("seller settlement failed", (e as Error).message); }
  try { await sb.rpc("notify_order", { p_order: orderId }); } catch {}

  try {
    const email = s.metadata?.user_email ?? s.customer_details?.email ?? null;
    if (email) {
      const { data: ownItems } = await sb.from("order_items").select("qty,unit_price_gross,offers!inner(fulfillment_provider)").eq("order_id", orderId).eq("offers.fulfillment_provider", "mysunrise");
      const ownNet = (ownItems ?? []).reduce((a: number, r: any) => a + Number(r.unit_price_gross ?? 0) * Number(r.qty ?? 0), 0);
      if (ownNet > 0) await pay("mkt-referral", { action: "sale", email, order_id: orderId, amount_net: ownNet, description: "Zakup marki własnej w Sunrise Market (karta)" });
    }
  } catch {}
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Brak podpisu", { status: 400 });
  const whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? Deno.env.get("STRIPE_WEBHOOK_SECRE");
  if (!whsec) return new Response("Brak konfiguracji Stripe webhook", { status: 400 });

  const raw = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  let event: any;
  try { event = await stripe.webhooks.constructEventAsync(raw, sig, whsec); }
  catch (err) { return new Response(`Nieprawidłowy podpis: ${(err as Error).message}`, { status: 400 }); }

  const sb = sbClient();
  const { error: dupErr } = await sb.from("stripe_events").insert({ event_id: event.id, type: event.type });
  if (dupErr) {
    if ((dupErr as any).code === "23505") return ok();
    return new Response("DB error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const topupId = s.metadata?.topup_id;
        const userId = s.metadata?.user_id;
        if (topupId && s.payment_status === "paid") {
          await sb.from("wallet_topups").update({ stripe_payment_intent: s.payment_intent ?? null }).eq("id", topupId);
          const { data: t } = await sb.from("wallet_topups").select("amount,currency").eq("id", topupId).single();
          await creditTopup(sb, { userId, topupId, amount: Number(t!.amount), currency: String(t!.currency) });
        } else if (s.metadata?.market_order_id) {
          await settleCardOrder(sb, s, stripe);
        }
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object;
        if (s.metadata?.topup_id) await sb.from("wallet_topups").update({ status: "expired" }).eq("id", s.metadata.topup_id);
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
    await sb.from("stripe_events").delete().eq("event_id", event.id);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }
});
