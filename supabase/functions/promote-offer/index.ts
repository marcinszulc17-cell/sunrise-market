import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-promotion-token",
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "market" } },
    );

    const token = req.headers.get("x-promotion-token") ?? "";
    const { data: secret } = await admin.from("internal_secrets").select("value").eq("key", "promotion_charge_token").maybeSingle();
    if (!secret?.value || token !== secret.value) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const purchaseId = String(body.purchase_id ?? "").trim();
    if (!purchaseId) return json({ ok: false, error: "invalid_request" }, 400);

    const { data: purchase } = await admin
      .from("promotion_purchases")
      .select("id,seller_id,offer_id,days,amount,status,mysunrise_tx_id,sellers(email)")
      .eq("id", purchaseId)
      .maybeSingle();
    if (!purchase) return json({ ok: false, error: "not_found" }, 404);
    if (purchase.status === "paid") return json({ ok: true, reused: true, amount: Number(purchase.amount) });

    const sellerEmail = String((purchase as any).sellers?.email ?? "").trim();
    if (!sellerEmail) return json({ ok: false, error: "seller_email_missing" }, 400);

    const serviceToken = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
    if (!serviceToken) return json({ ok: false, error: "service_not_configured" }, 503);
    const payBase = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");

    const amount = Number(purchase.amount);
    const payResp = await fetch(`${payBase}/pay-charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sunrise-Service-Token": serviceToken,
      },
      body: JSON.stringify({
        user_ref: sellerEmail,
        amount_grosz: Math.round(amount * 100),
        order_ref: `market-promotion:${purchase.offer_id}`,
        idempotency_key: purchase.id,
        currency: "SUNRISE_PAY",
      }),
    });
    const pay = await payResp.json().catch(() => ({}));
    if (!payResp.ok || pay?.ok === false) {
      await admin.from("promotion_purchases").update({
        status: "failed",
        last_error: String(pay?.error ?? `pay_charge_${payResp.status}`),
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);
      return json({ ok: false, error: pay?.error ?? "payment_failed" }, payResp.status === 402 ? 402 : 400);
    }

    const { error: promoErr } = await admin.from("promoted_offers").upsert({
      offer_id: purchase.offer_id,
      seller_id: purchase.seller_id,
      budget: amount,
      spent: amount,
      pricing_code: "highlight_day",
      status: "active",
      source_purchase_id: purchase.id,
    }, { onConflict: "source_purchase_id" });
    if (promoErr) {
      await admin.from("promotion_purchases").update({
        status: "failed",
        mysunrise_tx_id: pay?.tx_id ? String(pay.tx_id) : null,
        last_error: `promotion_create_failed:${promoErr.message}`,
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);
      return json({ ok: false, error: "promotion_create_failed" }, 500);
    }

    await admin.from("promotion_purchases").update({
      status: "paid",
      mysunrise_tx_id: pay?.tx_id ? String(pay.tx_id) : null,
      last_error: null,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", purchase.id);

    return json({ ok: true, amount });
  } catch (err) {
    return json({ ok: false, error: "internal", message: (err as Error).message }, 500);
  }
});
