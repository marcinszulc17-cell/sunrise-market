// cj-forward-order — auto-forward oplaconego zamowienia do CJ. Operator only.
// Autoryzacja CJ API v2: POST getAccessToken { apiKey }. Sekret: CJ_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function cjToken() {
  const key = Deno.env.get("CJ_API_KEY");
  if (!key) return null;
  const r = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key }),
  });
  const j = await r.json().catch(() => null);
  return j?.data?.accessToken ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);

  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const orderId = body.order_id;
  if (!orderId) return json({ error: "order_id wymagane." }, 400);

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return json({ error: "Nie znaleziono zamowienia." }, 404);
  const { data: items } = await admin.from("order_items").select("id, offer_id, seller_id, qty").eq("order_id", orderId);
  if (!items || items.length === 0) return json({ error: "Zamowienie bez pozycji." }, 400);

  const token = await cjToken();
  if (!token) return json({ available: false, error: "Brak/nieprawidlowy CJ_API_KEY." });

  const results = [];
  for (const it of items) {
    const { data: offer } = await admin.from("offers").select("id, title, fulfillment_provider").eq("id", it.offer_id).maybeSingle();
    if (offer?.fulfillment_provider !== "cj") continue;

    const { data: map } = await admin.from("cj_product_map").select("cj_pid, cj_vid, cj_sku").eq("offer_id", it.offer_id).maybeSingle();
    if (!map) { results.push({ offer_id: it.offer_id, skipped: "brak mapowania CJ" }); continue; }

    let vid = map.cj_vid;
    if (!vid) {
      const qr = await fetch(`${CJ_BASE}/product/query?pid=${encodeURIComponent(map.cj_pid)}`, { headers: { "CJ-Access-Token": token } });
      const qj = await qr.json().catch(() => null);
      vid = qj?.data?.variants?.[0]?.vid ?? "";
    }

    const { data: task } = await admin.from("fulfillment_tasks").insert({
      order_id: orderId, order_item_id: it.id, offer_id: it.offer_id, seller_id: it.seller_id,
      lane: "ours", provider: "cj", sku: map.cj_sku, title: offer.title, qty: it.qty,
      ship_name: order.ship_name, ship_phone: order.ship_phone, ship_street: order.ship_street,
      ship_city: order.ship_city, ship_postal: order.ship_postal, ship_country: order.ship_country ?? "PL",
      status: "pending",
    }).select("id").single();

    const co = await fetch(`${CJ_BASE}/shopping/order/createOrderV2`, {
      method: "POST", headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: `SUN-${String(orderId).slice(0, 8)}-${String(it.id).slice(0, 4)}`,
        shippingCustomerName: order.ship_name, shippingPhone: order.ship_phone,
        shippingCountryCode: order.ship_country ?? "PL", shippingProvince: order.ship_city,
        shippingCity: order.ship_city, shippingAddress: order.ship_street, shippingZip: order.ship_postal,
        products: [{ vid, quantity: it.qty }],
      }),
    });
    const cj = await co.json().catch(() => null);
    const cjOrderId = cj?.data?.orderId ?? cj?.data?.orderNum ?? null;
    const ok = !!cjOrderId;
    if (task?.id) {
      await admin.from("fulfillment_tasks").update({
        status: ok ? "forwarded" : "error", external_ref: cjOrderId,
        note: ok ? null : JSON.stringify(cj ?? {}).slice(0, 300), updated_at: new Date().toISOString(),
      }).eq("id", task.id);
    }
    results.push({ offer_id: it.offer_id, cj_order: cjOrderId, ok });
  }

  return json({ ok: true, order_id: orderId, forwarded: results });
});
