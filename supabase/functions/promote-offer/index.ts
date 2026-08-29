import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offer_id ?? "").trim();
    const days = Number(body.days);
    const requestId = String(body.request_id ?? "").trim();
    if (!offerId || !requestId || !Number.isInteger(days) || days < 1 || days > 365) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "market" } },
    );

    const { data: seller } = await admin
      .from("sellers")
      .select("id,email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!seller?.id || !seller.email) return json({ ok: false, error: "seller_not_found" }, 403);

    const { data: offer } = await admin
      .from("offers")
      .select("id,seller_id")
      .eq("id", offerId)
      .maybeSingle();
    if (!offer?.id || offer.seller_id !== seller.id) return json({ ok: false, error: "forbidden" }, 403);

    const { data: rate } = await admin
      .from("ad_rates")
      .select("price")
      .eq("code", "highlight_day")
      .eq("active", true)
      .maybeSingle();
    const unit = Number(rate?.price ?? 0);
    if (!(unit > 0)) return json({ ok: false, error: "pricing_unavailable" }, 503);
    const amount = Math.round(unit * days * 100) / 100;

    const { data: existing } = await admin
      .from("promotion_purchases")
      .select("id,status,amount,mysunrise_tx_id")
      .eq("id", requestId)
      .maybeSingle();
    if (existing?.status === "paid") return json({ ok: true, amount: Number(existing.amount), reused: true });
    if (existing && Number(existing.amount) !== amount) return json({ ok: false, error: "request_conflict" }, 409);

    if (!existing) {
      const { error: createErr } = await admin.from("promotion_purchases").insert({
        id: requestId,
        seller_id: seller.id,
        offer_id: offerId,
        days,
        amount,
        pricing_code: "highlight_day",
        status: "pending",
      });
      if (createErr) return json({ ok: false, error: "purchase_create_failed", message: createErr.message }, 500);
    }

    const payBase = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
    const serviceToken = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
    if (!serviceToken) return json({ ok: false, error: "service_not_configured" }, 503);

    const payResp = await fetch(`${payBase}/pay-charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": serviceToken },
      body: JSON.stringify({
        user_ref: seller.email,
        amount_grosz: Math.round(amount * 100),
        order_ref: `market-promotion:${offerId}`,
        idempotency_key: requestId,
        currency: "SUNRISE_PAY",
      }),
    });
    const pay = await payResp.json().catch(() => ({}));
    if (!payResp.ok || pay?.ok === false) {
      await admin.from("promotion_purchases").update({
        status: "failed",
        last_error: String(pay?.error ?? `pay_charge_${payResp.status}`),
        updated_at: new Date().toISOString(),
      }).eq("id", requestId);
      return json({ ok: false, error: pay?.error ?? "payment_failed", message: pay?.message }, payResp.status === 402 ? 402 : 400);
    }

    const { error: promoErr } = await admin.from("promoted_offers").upsert({
      offer_id: offerId,
      seller_id: seller.id,
      budget: amount,
      spent: amount,
      pricing_code: "highlight_day",
      status: "active",
      source_purchase_id: requestId,
    }, { onConflict: "source_purchase_id" });
    if (promoErr) {
      await admin.from("promotion_purchases").update({
        status: "failed",
        mysunrise_tx_id: pay?.tx_id ? String(pay.tx_id) : null,
        last_error: `promotion_create_failed:${promoErr.message}`,
        updated_at: new Date().toISOString(),
      }).eq("id", requestId);
      return json({ ok: false, error: "promotion_create_failed" }, 500);
    }

    await admin.from("promotion_purchases").update({
      status: "paid",
      mysunrise_tx_id: pay?.tx_id ? String(pay.tx_id) : null,
      last_error: null,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", requestId);

    return json({ ok: true, amount });
  } catch (err) {
    return json({ ok: false, error: "internal", message: (err as Error).message }, 500);
  }
});
