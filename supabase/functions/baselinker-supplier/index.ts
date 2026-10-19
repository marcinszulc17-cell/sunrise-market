// baselinker-supplier — wspolny automat dostawcow FMCG podlaczonych jako magazyny zewnetrzne BaseLinker.
// Akcje: storages, preview, sync, forward.
// Sekret BASELINKER_API_TOKEN moze byc w env albo market.internal_secrets(key='baselinker_api_token').
// Wywolania wewnetrzne wymagaja x-bridge-token = BRIDGE_INTERNAL_TOKEN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BL = "https://api.baselinker.com/connector.php";
const SUNRISE_SELLER = "11111111-1111-1111-1111-111111111111";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

async function bl(token: string, method: string, parameters: Record<string, unknown> = {}) {
  const body = new URLSearchParams({ method, parameters: JSON.stringify(parameters) });
  const r = await fetch(BL, {
    method: "POST",
    headers: { "X-BLToken": token, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.status !== "SUCCESS") {
    throw new Error(`BaseLinker ${method}: ${data?.error_message || r.statusText || "unknown error"}`);
  }
  return data;
}

function storageNumericId(storageId: string) {
  const m = /^warehouse_(\d+)$/.exec(storageId);
  return m ? Number(m[1]) : null;
}

function safeNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asObjectProducts(v: unknown): Record<string, any> {
  if (!v) return {};
  if (Array.isArray(v)) return Object.fromEntries(v.map((p: any) => [String(p.product_id), p]));
  if (typeof v === "object") return v as Record<string, any>;
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const URL = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const INTERNAL = Deno.env.get("BRIDGE_INTERNAL_TOKEN") || "";
  if (!URL || !SVC) return json({ error: "supabase_not_configured" }, 500);
  if (!INTERNAL || req.headers.get("x-bridge-token") !== INTERNAL) return json({ error: "forbidden" }, 403);

  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "storages");

  let token = Deno.env.get("BASELINKER_API_TOKEN") || "";
  if (!token) {
    const { data } = await admin.from("internal_secrets").select("value").eq("key", "baselinker_api_token").maybeSingle();
    token = String(data?.value || "");
  }
  if (!token) return json({ ok: false, configured: false, error: "Brak baselinker_api_token" }, 503);

  try {
    if (action === "storages") {
      const data = await bl(token, "getExternalStoragesList");
      return json({ ok: true, storages: data.storages || [] });
    }

    if (action === "preview") {
      const storageId = String(body.storage_id || "");
      if (!storageId) return json({ error: "storage_id_required" }, 400);
      const data = await bl(token, "getExternalStorageProductsList", {
        storage_id: storageId,
        filter_available: 1,
        page: Math.max(1, Number(body.page || 1)),
      });
      return json({ ok: true, storage_id: storageId, products: data.products || [] });
    }

    if (action === "sync") {
      const storageId = String(body.storage_id || "");
      const supplierCode = String(body.supplier_code || "").trim().toLowerCase();
      const categorySlug = String(body.category_slug || "supermarket-spozywcze");
      const priceMultiplier = Math.max(1, safeNumber(body.price_multiplier, 1));
      const activate = body.activate === true;
      const maxPages = Math.min(100, Math.max(1, Number(body.max_pages || 1)));
      if (!storageId || !supplierCode) return json({ error: "storage_id_and_supplier_code_required" }, 400);

      const { data: cat } = await admin.from("categories").select("id,slug").eq("slug", categorySlug).maybeSingle();
      if (!cat) return json({ error: "unknown_category", category_slug: categorySlug }, 400);

      const { data: existingRows } = await admin.from("offers")
        .select("id,attributes")
        .eq("seller_id", SUNRISE_SELLER)
        .eq("fulfillment_provider", "baselinker");
      const existing = new Map<string, string>();
      for (const row of existingRows || []) {
        const a = row.attributes || {};
        if (a.supplier_code === supplierCode && a.bl_storage_id === storageId && a.bl_product_id) {
          existing.set(String(a.bl_product_id), row.id);
        }
      }

      let inserted = 0, updated = 0, unavailable = 0, processed = 0;
      for (let page = 1; page <= maxPages; page++) {
        const list = await bl(token, "getExternalStorageProductsList", {
          storage_id: storageId,
          filter_available: 1,
          page,
        });
        const products = Array.isArray(list.products) ? list.products : Object.values(list.products || {});
        if (products.length === 0) break;

        const ids = products.map((p: any) => String(p.product_id)).filter(Boolean);
        const detailsResp = await bl(token, "getExternalStorageProductsData", { storage_id: storageId, products: ids });
        const details = asObjectProducts(detailsResp.products);

        for (const lite of products as any[]) {
          const pid = String(lite.product_id || "");
          if (!pid) continue;
          const d = details[pid] || lite;
          const qty = Math.max(0, Math.floor(safeNumber(d.quantity ?? lite.quantity, 0)));
          const supplierPrice = Math.max(0, safeNumber(d.price_brutto ?? lite.price_brutto, 0));
          if (supplierPrice <= 0) continue;
          const retail = Math.round(supplierPrice * priceMultiplier * 100) / 100;
          const images = Array.isArray(d.images) ? d.images.filter((x: unknown) => typeof x === "string") : [];
          const attrs = {
            supplier_platform: "baselinker",
            supplier_code: supplierCode,
            bl_storage_id: storageId,
            bl_product_id: pid,
            supplier_sku: d.sku || lite.sku || null,
            ean: d.ean || lite.ean || null,
            supplier_cost_gross: supplierPrice,
            vat_rate: safeNumber(d.tax_rate, 23),
            weight_kg: safeNumber(d.weight, 0),
            manufacturer: d.man_name || null,
            supplier_category_id: d.category_id || null,
            features: d.features || {},
            purchase_mode: "purchase",
            cashback_only: true,
            synced_at: new Date().toISOString(),
          };
          const payload = {
            seller_id: SUNRISE_SELLER,
            category_id: cat.id,
            title: String(d.name || lite.name || `Produkt ${pid}`).slice(0, 200),
            description: String(d.description || d.description_extra1 || "").slice(0, 20000),
            price_gross: retail,
            currency: "PLN",
            stock: qty,
            status: activate && qty > 0 ? "active" : "draft",
            attributes: attrs,
            image_url: images[0] || null,
            fulfillment_provider: "baselinker",
            commission_model: "cashback_only",
            updated_at: new Date().toISOString(),
          };
          const offerId = existing.get(pid);
          if (offerId) {
            const { error } = await admin.from("offers").update(payload).eq("id", offerId);
            if (error) throw error;
            updated++;
          } else {
            const { data: created, error } = await admin.from("offers").insert(payload).select("id").single();
            if (error) throw error;
            existing.set(pid, created.id);
            inserted++;
          }
          processed++;
          if (qty === 0) unavailable++;
        }
        if (products.length < 1000) break;
      }
      return json({ ok: true, supplier_code: supplierCode, storage_id: storageId, processed, inserted, updated, unavailable, activate });
    }

    if (action === "forward") {
      const orderId = String(body.order_id || "");
      if (!orderId) return json({ error: "order_id_required" }, 400);
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json({ error: "order_not_found" }, 404);
      if (!['paid','shipped'].includes(order.status)) return json({ error: "order_not_paid", status: order.status }, 409);

      const { data: items } = await admin.from("order_items")
        .select("id,offer_id,seller_id,qty,unit_price_gross")
        .eq("order_id", orderId);
      const offerIds = (items || []).map((x: any) => x.offer_id);
      const { data: offers } = offerIds.length ? await admin.from("offers")
        .select("id,title,fulfillment_provider,attributes")
        .in("id", offerIds) : { data: [] as any[] };
      const byOffer = new Map((offers || []).map((o: any) => [o.id, o]));

      const groups = new Map<string, { storageId: string; supplier: string; items: any[] }>();
      for (const it of items || []) {
        const offer: any = byOffer.get(it.offer_id);
        if (!offer || offer.fulfillment_provider !== "baselinker") continue;
        const a = offer.attributes || {};
        const storageId = String(a.bl_storage_id || "");
        const supplier = String(a.supplier_code || "baselinker");
        if (!storageId || !a.bl_product_id) continue;
        const k = `${supplier}|${storageId}`;
        if (!groups.has(k)) groups.set(k, { storageId, supplier, items: [] });
        groups.get(k)!.items.push({ ...it, offer, a });
      }

      if (groups.size === 0) return json({ ok: true, order_id: orderId, forwarded: [], note: "no_baselinker_items" });

      const statuses = await bl(token, "getOrderStatusList");
      const primary = (statuses.statuses || []).find((s: any) => Number(s.is_primary) === 1) || (statuses.statuses || [])[0];
      if (!primary?.id) throw new Error("BaseLinker: brak statusu zamowienia");

      let buyerEmail = "";
      try {
        const u = await admin.auth.admin.getUserById(order.buyer_id);
        buyerEmail = u.data.user?.email || "";
      } catch (_) { /* email nie jest wymagany */ }

      const forwarded = [];
      for (const g of groups.values()) {
        const taskIds = g.items.map((x) => x.id);
        const { data: existingTasks } = await admin.from("fulfillment_tasks")
          .select("id,order_item_id,external_ref,status")
          .eq("order_id", orderId)
          .eq("provider", g.supplier)
          .in("order_item_id", taskIds);
        const already = (existingTasks || []).find((t: any) => t.external_ref && ["forwarded","shipped","delivered"].includes(t.status));
        if (already) {
          forwarded.push({ supplier: g.supplier, storage_id: g.storageId, external_ref: already.external_ref, already: true });
          continue;
        }

        const numericStorage = storageNumericId(g.storageId);
        if (!numericStorage) throw new Error(`BaseLinker: ${g.storageId} nie jest magazynem hurtowni warehouse_*`);
        const blProducts = g.items.map((x) => ({
          storage: "warehouse",
          storage_id: numericStorage,
          product_id: String(x.a.bl_product_id),
          variant_id: 0,
          name: x.offer.title,
          sku: String(x.a.supplier_sku || ""),
          ean: String(x.a.ean || ""),
          price_brutto: safeNumber(x.a.supplier_cost_gross, x.unit_price_gross),
          tax_rate: safeNumber(x.a.vat_rate, 23),
          quantity: x.qty,
          weight: safeNumber(x.a.weight_kg, 0),
        }));

        const created = await bl(token, "addOrder", {
          order_status_id: Number(primary.id),
          date_add: Math.floor(Date.now() / 1000),
          currency: "PLN",
          payment_method: "Sunrise Market",
          payment_method_cod: 0,
          paid: 1,
          user_comments: "",
          admin_comments: `Sunrise Market ${orderId}`,
          email: buyerEmail,
          phone: order.ship_phone || "",
          user_login: "",
          delivery_method: order.shipping_method || "Dostawa hurtowni",
          delivery_price: 0,
          delivery_fullname: order.ship_name || "",
          delivery_company: "",
          delivery_address: order.ship_street || "",
          delivery_postcode: order.ship_postal || "",
          delivery_city: order.ship_city || "",
          delivery_state: "",
          delivery_country_code: order.ship_country || "PL",
          invoice_fullname: order.invoice_requested ? (order.ship_name || "") : "",
          invoice_company: order.invoice_requested ? (order.invoice_company_name || "") : "",
          invoice_nip: order.invoice_requested ? (order.invoice_tax_id || "") : "",
          invoice_address: order.invoice_requested ? (order.invoice_street || "") : "",
          invoice_postcode: order.invoice_requested ? (order.invoice_postal || "") : "",
          invoice_city: order.invoice_requested ? (order.invoice_city || "") : "",
          invoice_state: "",
          invoice_country_code: order.invoice_requested ? (order.invoice_country || "PL") : "PL",
          want_invoice: order.invoice_requested ? 1 : 0,
          products: blProducts,
        });
        const externalRef = String(created.order_id || "");
        for (const x of g.items) {
          await admin.from("fulfillment_tasks").update({
            provider: g.supplier,
            status: "forwarded",
            external_ref: externalRef,
            note: `BaseLinker ${g.storageId}`,
            updated_at: new Date().toISOString(),
          }).eq("order_id", orderId).eq("order_item_id", x.id);
        }
        forwarded.push({ supplier: g.supplier, storage_id: g.storageId, external_ref: externalRef, items: g.items.length });
      }
      return json({ ok: true, order_id: orderId, forwarded });
    }

    return json({ error: "unknown_action", action }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
