import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Stripe przez npm: build esm.sh ciągnął polyfill std@0.177.1/node, który na obecnym runtime Supabase logował "Deno.core.runMicrotasks() is not supported".
import Stripe from "npm:stripe@16.12.0";

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
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
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
const FREE_SHIPPING_THRESHOLD = 149;
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
function money(v: number) { return Math.round(Math.max(0, Number(v) || 0) * 100) / 100; }
function text(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function validPolishNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = w.reduce((sum, weight, i) => sum + weight * Number(nip[i]), 0) % 11;
  return checksum !== 10 && checksum === Number(nip[9]);
}
function invoiceSnapshot(raw: any) {
  const requested = raw?.requested === true;
  const now = new Date().toISOString();
  if (!requested) return {
    invoice_requested: false,
    invoice_company_name: null,
    invoice_tax_id: null,
    invoice_street: null,
    invoice_city: null,
    invoice_postal: null,
    invoice_country: null,
    invoice_snapshot_at: now,
  };
  const company = text(raw.company_name);
  const country = (text(raw.country) || "PL").toUpperCase().slice(0, 2);
  const taxId = country === "PL" ? text(raw.tax_id).replace(/\D/g, "") : text(raw.tax_id).toUpperCase();
  const street = text(raw.street);
  const city = text(raw.city);
  const postal = text(raw.postal);
  if (!company || !taxId || !street || !city || !postal || !country) throw new Error("Uzupełnij komplet danych do faktury");
  if (country === "PL" && !validPolishNip(taxId)) throw new Error("Podaj prawidłowy polski NIP");
  if (country === "PL" && !/^\d{2}-\d{3}$/.test(postal)) throw new Error("Podaj kod pocztowy w formacie 00-000");
  return {
    invoice_requested: true,
    invoice_company_name: company.slice(0, 200),
    invoice_tax_id: taxId.slice(0, 40),
    invoice_street: street.slice(0, 200),
    invoice_city: city.slice(0, 120),
    invoice_postal: postal.slice(0, 30),
    invoice_country: country,
    invoice_snapshot_at: now,
  };
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
async function pay(path: string, body: unknown): Promise<{ status: number; data: any }> {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const r = await fetch(`${PAY_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify(body),
  });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

// Ochrona Kupujących Sunrise (decyzja właściciela 2026-09-05): wypłata sprzedawcy jest WSTRZYMANA
// (seller_settlements.status='scheduled', available_at=null) do potwierdzenia odbioru przez kupującego
// lub auto-zwolnienia po `platform_config.buyer_protection_hold_days` (market.auto_release_settlements).
// Wyjątek — wypłata natychmiast jak dotąd: odnowienia subskrypcji (stripe_session_id 'inv:%') oraz
// zamówienia, których WSZYSTKIE pozycje to subskrypcje (usługa ciągła, nie ma "dostawy").
// Rezerwacje (bookings) zachowują dotychczasowy mechanizm: scheduled + available_at = ends_at.
async function isImmediatePayoutOrder(sb: any, orderId: string): Promise<boolean> {
  const { data: ord } = await sb.from("orders").select("stripe_session_id").eq("id", orderId).maybeSingle();
  if (String(ord?.stripe_session_id ?? "").startsWith("inv:")) return true;
  const { data: items } = await sb.from("order_items").select("offers!inner(attributes)").eq("order_id", orderId);
  const list = items ?? [];
  return list.length > 0 && list.every((it: any) => !!it.offers?.attributes?.subscription);
}

async function settleSellerPayouts(sb: any, orderId: string) {
  const { data: booking } = await sb.from("bookings").select("ends_at").eq("order_id", orderId).maybeSingle();
  const { data: rows, error } = await sb
    .from("order_items")
    .select("seller_id,seller_payout,sellers!inner(email,seller_type)")
    .eq("order_id", orderId);
  if (error) throw error;
  const hold = !booking && !(await isImmediatePayoutOrder(sb, orderId));

  // Cel wypłaty (decyzja właściciela 2026-09-05): zwykły sprzedawca -> portfel prywatny,
  // Partner Handlowy (firma, seller_type=business) -> saldo firmowe (merchant) w Sunrise Pay.
  const grouped = new Map<string, { email: string; amount: number; target: "personal" | "merchant" }>();
  for (const row of rows ?? []) {
    const sellerId = String(row.seller_id ?? "");
    const email = String(row.sellers?.email ?? "").trim();
    if (!sellerId || !email) continue;
    const target: "personal" | "merchant" = String(row.sellers?.seller_type ?? "") === "business" ? "merchant" : "personal";
    const prev = grouped.get(sellerId) ?? { email, amount: 0, target };
    prev.amount = money(prev.amount + Number(row.seller_payout ?? 0));
    grouped.set(sellerId, prev);
  }

  for (const [sellerId, entry] of grouped.entries()) {
    const amount = money(entry.amount);
    if (amount <= 0) continue;

    await sb.from("seller_settlements").upsert({
      order_id: orderId,
      seller_id: sellerId,
      seller_email: entry.email,
      amount,
      status: booking || hold ? "scheduled" : "pending",
      available_at: booking?.ends_at ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id,seller_id", ignoreDuplicates: true });

    // Rezerwacja lub blokada Ochrony Kupujących: wypłatę zrobi retry-seller-settlements po available_at.
    if (booking || hold) continue;

    const idem = await uuidv5(`market:seller:${orderId}:${sellerId}`);
    const credited = await pay("pay-credit", {
      user_ref: entry.email,
      amount_grosz: Math.round(amount * 100),
      reason: "Sprzedaż Sunrise Market",
      order_ref: orderId,
      idempotency_key: idem,
      target: entry.target,
    });

    const ok = credited.status === 200 && credited.data?.ok === true;
    await sb.from("seller_settlements").update({
      status: ok ? "settled" : "failed",
      attempts: 1,
      mysunrise_tx_id: ok && credited.data?.tx_id ? String(credited.data.tx_id) : null,
      last_error: ok ? null : String(credited.data?.message ?? credited.data?.error ?? credited.status),
      settled_at: ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("order_id", orderId).eq("seller_id", sellerId);
  }
}

async function settleAmbassadorCommission(sb: any, orderId: string, email: string, description: string) {
  try {
    await sb.rpc("enqueue_ambassador_commission", { p_order: orderId });
    const { data: outbox, error } = await sb.from("ambassador_commission_outbox")
      .select("id,status,amount_net,attempts")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!outbox || outbox.status === "sent" || outbox.status === "pending_vat" || outbox.status === "pending_identity") return;

    const amountNet = money(Number(outbox.amount_net ?? 0));
    if (amountNet <= 0) return;
    const attempts = Number(outbox.attempts ?? 0) + 1;
    const now = new Date().toISOString();
    const referral = await pay("mkt-referral", {
      action: "sale",
      email,
      order_id: orderId,
      amount_net: amountNet,
      description,
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
      const { data: outbox } = await sb.from("ambassador_commission_outbox").select("id,attempts").eq("order_id", orderId).maybeSingle();
      if (outbox) await sb.from("ambassador_commission_outbox").update({
        status: "failed",
        attempts: Number(outbox.attempts ?? 0) + 1,
        last_error: String((e as Error).message ?? e).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", outbox.id).neq("status", "sent");
    } catch {}
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Brak autoryzacji" }, 401);
    const email = user.email;
    if (!email) return json({ error: "Konto bez e-maila" }, 400);
    const { items, booking_id, shipping_code, shipping_codes, shipping, invoice, coupon, payment_method } = await req.json();
    const bookingId = typeof booking_id === "string" && booking_id ? booking_id : null;
    if (!bookingId && (!Array.isArray(items) || items.length === 0)) return json({ error: "Pusty koszyk" }, 400);
    const payMethod = payment_method === "card" ? "card" : "wallet";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
    const { data: orderId, error: e1 } = bookingId
      ? await sb.rpc("checkout_booking", { p_buyer_id: user.id, p_booking_id: bookingId })
      : await sb.rpc("checkout", { p_buyer_id: user.id, p_items: items });
    if (e1) throw e1;

    const codes: string[] = bookingId ? [] : (Array.isArray(shipping_codes) && shipping_codes.length ? shipping_codes.filter((c: unknown) => typeof c === "string") : (shipping_code ? [shipping_code] : []));
    let shipCost = 0; let shipLabel: string | null = null;
    if (codes.length) {
      const { data: sm } = await sb.from("shipping_methods").select("code,name,price_gross").in("code", codes);
      const rows = (sm ?? []) as { code: string; name: string; price_gross: number }[];
      shipCost = rows.reduce((a, r) => a + Number(r.price_gross ?? 0), 0);
      shipLabel = rows.map((r) => r.name).join(" + ") || null;
    }
    const { data: ord0 } = await sb.from("orders").select("total_gross,deposit_gross,invoice_snapshot_at").eq("id", orderId).single();
    const productSubtotal = Number(ord0!.total_gross);
    const refundableDeposit = bookingId ? money(Number(ord0?.deposit_gross ?? 0)) : 0;
    if (productSubtotal >= FREE_SHIPPING_THRESHOLD) shipCost = 0;
    try {
      const { data: isSmart } = await sb.rpc("is_smart_member", { p_user: user.id });
      if (isSmart === true) {
        const { data: minCfg } = await sb.from("platform_config").select("value").eq("key", "smart_min_order_pln").maybeSingle();
        if (productSubtotal >= Number(minCfg?.value ?? "49")) shipCost = 0;
      }
    } catch {}

    let discount = 0; let couponCode: string | null = null;
    try {
      const couponRaw = bookingId ? "" : (typeof coupon === "string" ? coupon : "").trim();
      if (couponRaw) {
        const { data: cv } = await sb.rpc("validate_coupon", { p_code: couponRaw, p_subtotal: productSubtotal });
        if (cv && cv.valid === true) {
          discount = Math.min(Math.max(0, Number(cv.discount) || 0), productSubtotal);
          couponCode = (cv.code as string) || couponRaw.toUpperCase();
        }
      }
    } catch { discount = 0; couponCode = null; }

    const discountedProducts = money(productSubtotal - discount);
    const finalTotal = money(discountedProducts + shipCost);
    const { data: cashbackCfg } = await sb.from("platform_config").select("value").eq("key", "cashback_rate").maybeSingle();
    const cashbackRate = Math.max(0, Number(cashbackCfg?.value ?? 0.03));
    const cashbackBase = money(Math.max(0, discountedProducts - refundableDeposit));
    // Cashback 3% TYLKO przy płatności portfelem Sunrise Pay (CLAUDE.md §1). Karta/BLIK/P24 = 0.
    // Decyzja właściciela 2026-09-05: cashback przy KAŻDEJ metodzie płatności (portfel, karta/BLIK/P24, subskrypcje).
    const cashback = money(cashbackBase * cashbackRate);
    const inv = ord0?.invoice_snapshot_at ? {} : invoiceSnapshot(invoice);

    await sb.from("orders").update({
      shipping_method: shipLabel, shipping_cost: shipCost, total_gross: finalTotal,
      coupon_code: couponCode, discount_amount: discount, cashback_amount: cashback,
      ship_name: shipping?.name ?? null, ship_phone: shipping?.phone ?? null,
      ship_street: shipping?.street ?? null, ship_city: shipping?.city ?? null,
      ship_postal: shipping?.postal ?? null, ship_country: shipping?.country ?? "PL",
      ...inv,
    }).eq("id", orderId);
    const amountGrosz = Math.round(finalTotal * 100);

    if (payMethod === "card") {
      const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const origin = Deno.env.get("PUBLIC_WEB_URL") ?? req.headers.get("origin") ?? "";
      const successUrl = bookingId ? `${origin}/rezerwacje?card=success&booking=${bookingId}&order=${orderId}` : `${origin}/koszyk?card=success&order=${orderId}&paid=${finalTotal}`;
      const cancelUrl = bookingId ? `${origin}/rezerwacje?card=cancel&booking=${bookingId}&order=${orderId}` : `${origin}/koszyk?card=cancel&order=${orderId}`;
      let bookingExpiresAt: number | undefined;
      if (bookingId) {
        const { data: booking } = await sb.from("bookings").select("hold_expires_at").eq("id", bookingId).eq("order_id", orderId).single();
        bookingExpiresAt = Math.floor(new Date(booking!.hold_expires_at).getTime() / 1000);
      }
      // Subskrypcje (attributes.subscription): Stripe Checkout w trybie subscription — pozycja abonamentowa
      // jako cena cykliczna (miesiąc, z góry, auto-odnawianie), reszta koszyka jako pozycje jednorazowe.
      const { data: subItems } = await sb.from("order_items").select("offer_id,qty,unit_price_gross,offers!inner(title,attributes)").eq("order_id", orderId);
      const subscriptionLines = (subItems ?? []).filter((it: any) => it.offers?.attributes?.subscription);
      let session;
      if (!bookingId && subscriptionLines.length > 0) {
        const oneOff = (subItems ?? []).filter((it: any) => !it.offers?.attributes?.subscription);
        const line_items: any[] = [];
        for (const it of subscriptionLines) {
          const interval = it.offers?.attributes?.subscription?.interval === "year" ? "year" : "month";
          line_items.push({ price_data: { currency: "pln", product_data: { name: `${it.offers.title} — subskrypcja ${interval === "year" ? "roczna" : "miesięczna"}` }, unit_amount: Math.round(Number(it.unit_price_gross) * 100), recurring: { interval } }, quantity: Number(it.qty) || 1 });
        }
        for (const it of oneOff) {
          line_items.push({ price_data: { currency: "pln", product_data: { name: it.offers.title }, unit_amount: Math.round(Number(it.unit_price_gross) * 100) }, quantity: Number(it.qty) || 1 });
        }
        const extras = money(finalTotal - (subItems ?? []).reduce((a: number, it: any) => a + Number(it.unit_price_gross) * Number(it.qty || 1), 0));
        if (extras > 0) line_items.push({ price_data: { currency: "pln", product_data: { name: "Dostawa" }, unit_amount: Math.round(extras * 100) }, quantity: 1 });
        if (extras < 0) line_items.push({ price_data: { currency: "pln", product_data: { name: "Rabat" }, unit_amount: 0 }, quantity: 1 });
        session = await stripe.checkout.sessions.create({ mode: "subscription", payment_method_types: ["card"], currency: "pln", line_items, metadata: { market_order_id: String(orderId), booking_id: "", user_id: user.id, user_email: email, subscription_order: "1" }, subscription_data: { metadata: { market_order_id: String(orderId), user_email: email } }, customer_email: email, success_url: successUrl, cancel_url: cancelUrl });
      } else {
        session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card", "p24", "blik"], currency: "pln", line_items: [{ price_data: { currency: "pln", product_data: { name: bookingId ? "Rezerwacja Sunrise Market" : "Zamówienie Sunrise Market" }, unit_amount: amountGrosz }, quantity: 1 }], metadata: { market_order_id: String(orderId), booking_id: bookingId ?? "", user_id: user.id, user_email: email }, customer_email: email, expires_at: bookingExpiresAt, success_url: successUrl, cancel_url: cancelUrl }, bookingId ? { idempotencyKey: `market-booking:${orderId}` } : undefined);
      }
      await sb.from("orders").update({ payment_provider: "stripe", stripe_session_id: session.id }).eq("id", orderId);
      return json({ order_id: orderId, url: session.url, payment: "card", total: finalTotal, cashback });
    }

    // Subskrypcje wyłącznie przez Stripe (auto-odnawianie kartą) — portfelem nie da się kupić abonamentu.
    if (!bookingId) {
      const { data: subCheck } = await sb.from("order_items").select("offers!inner(attributes)").eq("order_id", orderId);
      if ((subCheck ?? []).some((it: any) => it.offers?.attributes?.subscription)) {
        await sb.rpc("release_unpaid_order", { p_order_id: orderId }).then(() => {}, () => {});
        return json({ error: "Subskrypcję opłacasz kartą — odnawia się automatycznie co miesiąc. Wybierz płatność kartą.", subscription_requires_card: true }, 402);
      }
    }
    const chargeKey = await uuidv5(`market:charge:${orderId}`);
    const charge = await pay("pay-charge", { user_ref: email, amount_grosz: amountGrosz, order_ref: orderId, idempotency_key: chargeKey });
    if (charge.status === 402 || (charge.data && charge.data.ok === false && charge.data.error === "insufficient_funds")) {
      const balGr = Number(charge.data?.balance_grosz ?? 0);
      const shortGr = Number(charge.data?.shortfall_grosz ?? Math.max(0, amountGrosz - balGr));
      if (bookingId) await sb.rpc("release_unpaid_booking", { p_booking_id: bookingId, p_order_id: orderId });
      return json({ error: "Za malo srodkow w portfelu Sunrise Pay", need_topup: true, balance: balGr / 100, shortfall: shortGr / 100, required: finalTotal }, 402);
    }
    if (charge.status !== 200 || !charge.data?.ok) return json({ error: `Platnosc portfelem nieudana: ${charge.data?.message ?? charge.data?.error ?? charge.status}` }, 402);
    const newBalanceGr = Number(charge.data.balance_grosz ?? 0);

    const { error: feeError } = await sb.rpc("apply_sunrise_pay_fee", { p_order_id: orderId });
    if (feeError) throw feeError;
    await sb.from("orders").update({ status: "paid", payment_provider: "sunrise_pay" }).eq("id", orderId);
    if (bookingId) {
      const { error: bookingError } = await sb.rpc("confirm_paid_booking", { p_order_id: orderId, p_payment_provider: "sunrise_pay" });
      if (bookingError) throw bookingError;
    }
    if (couponCode && discount > 0) { try { await sb.rpc("coupon_consume", { p_code: couponCode }); } catch {} }

    if (cashback > 0) {
      const pointsKey = await uuidv5(`market:points:${orderId}`);
      await pay("pay-credit-points", { user_ref: email, points: cashback, reason: "cashback", order_ref: orderId, idempotency_key: pointsKey });
    }

    try { await settleSellerPayouts(sb, String(orderId)); } catch (e) {
      console.error("seller settlement failed", (e as Error).message);
    }
    await sb.rpc("notify_order", { p_order: orderId });
    await settleAmbassadorCommission(sb, String(orderId), email, bookingId ? "Opłacona rezerwacja w Sunrise Market" : "Zakup w Sunrise Market");

    return json({ order_id: orderId, paid: finalTotal, discount, coupon: couponCode, cashback, balance: newBalanceGr / 100 });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
});