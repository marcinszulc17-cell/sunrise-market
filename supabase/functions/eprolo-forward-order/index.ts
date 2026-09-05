// eprolo-forward-order — przekazanie oplaconego zamowienia do Eprolo (add_order.html). Operator only.
// variantsid pobierany z getproduct.html (dopasowanie po SKU). Tryb dryRun = nie tworzy zamowienia u dostawcy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const EPROLO_BASE = "https://openapi.eprolo.com";

function eproloAuth(apiKey, apiSecret) {
  const timestamp = String(Date.now());
  const sign = createHash("md5").update(apiKey + timestamp + apiSecret).digest("hex");
  return { timestamp, sign };
}
function authHeaders(apiKey, apiSecret) {
  const { timestamp, sign } = eproloAuth(apiKey, apiSecret);
  return { headers: { "Content-Type": "application/json", apiKey, sign, timestamp }, qs: `sign=${sign}&timestamp=${timestamp}` };
}

// Nazwa kraju po kodzie (Eprolo chce nazwe + dwuliterowy kod).
const COUNTRY = { PL: "Poland", DE: "Germany", CZ: "Czechia", GB: "United Kingdom", FR: "France", US: "United States" };

// getproduct.html -> variantsid (variantlist[].id), dopasowanie po SKU, inaczej pierwszy wariant.
async function resolveVariantsId(apiKey, apiSecret, eproloPid, wantSku) {
  const a = authHeaders(apiKey, apiSecret);
  const url = `${EPROLO_BASE}/getproduct.html?id=${encodeURIComponent(eproloPid)}&product_id=${encodeURIComponent(eproloPid)}&${a.qs}`;
  const r = await fetch(url, { method: "GET", headers: a.headers });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch { /* nizej */ }
  if (!j || (j.code !== "0" && j.code !== 0)) return { error: j?.msg ?? `getproduct HTTP ${r.status}`, raw: txt.slice(0, 200) };
  const prod = Array.isArray(j.data) ? j.data[0] : j.data;
  const variants = prod?.variantlist ?? [];
  if (!variants.length) return { error: "brak wariantow w getproduct" };
  const match = wantSku ? variants.find((v) => v.sku === wantSku) : null;
  const v = match ?? variants[0];
  return { variantsid: String(v.id), sku: v.sku, cost: v.cost };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);

  const apiKey = Deno.env.get("EPROLO_API_KEY"); const apiSecret = Deno.env.get("EPROLO_API_SECRET");
  if (!apiKey || !apiSecret) return json({ available: false, error: "Brak EPROLO_API_KEY / EPROLO_API_SECRET w Secrets." });

  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const orderId = body.order_id;
  const dryRun = body.dryRun === true;
  if (!orderId) return json({ error: "order_id wymagane." }, 400);

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return json({ error: "Nie znaleziono zamowienia." }, 404);
  const { data: items } = await admin.from("order_items").select("id, offer_id, seller_id, qty").eq("order_id", orderId);
  if (!items || items.length === 0) return json({ error: "Zamowienie bez pozycji." }, 400);

  // tylko pozycje Eprolo
  const resolved = []; const skipped = [];
  for (const it of items) {
    const { data: offer } = await admin.from("offers").select("id, title, fulfillment_provider").eq("id", it.offer_id).maybeSingle();
    if (offer?.fulfillment_provider !== "eprolo") continue;
    const { data: map } = await admin.from("eprolo_product_map").select("eprolo_pid, eprolo_sku").eq("offer_id", it.offer_id).maybeSingle();
    if (!map) { skipped.push({ offer_id: it.offer_id, reason: "brak mapowania Eprolo" }); continue; }
    const rv = await resolveVariantsId(apiKey, apiSecret, map.eprolo_pid, map.eprolo_sku);
    if (rv.error) { skipped.push({ offer_id: it.offer_id, eprolo_pid: map.eprolo_pid, reason: rv.error, raw: rv.raw }); continue; }
    resolved.push({ item: it, title: offer.title, eprolo_pid: map.eprolo_pid, variantsid: rv.variantsid, sku: rv.sku, qty: it.qty });
  }

  if (!resolved.length) return json({ ok: false, order_id: orderId, error: "Brak pozycji Eprolo z ustalonym variantsid.", skipped });

  const code = String(order.ship_country ?? "PL").toUpperCase();
  const payload = {
    tax_cost: 0,
    order_id: `SUN-EPR-${String(orderId)}`,
    order_number: `SUN-${String(orderId).slice(0, 12)}`,
    note: `Sunrise Market ${orderId}`,
    shipping_country: COUNTRY[code] ?? order.ship_country ?? "Poland",
    shipping_country_code: code,
    shipping_province: order.ship_city ?? "",
    shipping_province_code: String(order.ship_city ?? "").slice(0, 8),
    shipping_post_code: order.ship_postal ?? "",
    shipping_city: order.ship_city ?? "",
    shipping_name: order.ship_name ?? "",
    shipping_address: order.ship_street ?? "",
    shipping_phone: order.ship_phone ?? "",
    orderItemlist: resolved.map((r) => ({ variantsid: r.variantsid, quantity: r.qty })),
  };

  if (dryRun) return json({ ok: true, dryRun: true, order_id: orderId, resolved: resolved.map((r) => ({ offer_id: r.item.offer_id, title: r.title, variantsid: r.variantsid, sku: r.sku, qty: r.qty })), skipped, payload });

  // utworz zadania fulfillment (pending) dla kazdej pozycji
  const taskIds = [];
  for (const r of resolved) {
    const { data: task } = await admin.from("fulfillment_tasks").insert({
      order_id: orderId, order_item_id: r.item.id, offer_id: r.item.offer_id, seller_id: r.item.seller_id,
      lane: "ours", provider: "eprolo", sku: r.sku, title: r.title, qty: r.qty,
      ship_name: order.ship_name, ship_phone: order.ship_phone, ship_street: order.ship_street,
      ship_city: order.ship_city, ship_postal: order.ship_postal, ship_country: order.ship_country ?? "PL",
      status: "pending",
    }).select("id").single();
    taskIds.push(task?.id ?? null);
  }

  const a = authHeaders(apiKey, apiSecret);
  const co = await fetch(`${EPROLO_BASE}/add_order.html?${a.qs}`, { method: "POST", headers: a.headers, body: JSON.stringify(payload) });
  const txt = await co.text();
  let ej = null; try { ej = JSON.parse(txt); } catch { /* nizej */ }
  const ok = ej && (ej.code === "0" || ej.code === 0);
  const eproloOrderId = ok ? (ej.data?.order_id ?? ej.data?.orderid ?? ej.data?.orderId ?? null) : null;
  const noteTxt = ok ? null : (ej?.msg ?? txt.slice(0, 300));
  for (const tid of taskIds) {
    if (!tid) continue;
    await admin.from("fulfillment_tasks").update({ status: ok ? "forwarded" : "error", external_ref: eproloOrderId, note: noteTxt, updated_at: new Date().toISOString() }).eq("id", tid);
  }

  return json({ ok, order_id: orderId, eprolo_order: eproloOrderId, code: ej?.code, msg: ej?.msg, forwarded: resolved.length, skipped, raw: ok ? undefined : txt.slice(0, 300) });
});
