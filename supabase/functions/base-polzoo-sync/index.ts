// PolZoo -> Base inventory -> Sunrise Market catalog.
// Products are drafts by default. Activation requires an explicit positive markup.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE_API_URL = "https://api.baselinker.com/connector.php";
const BASE_TOKEN = Deno.env.get("BASE_API_TOKEN") ?? "";
const BRIDGE_TOKEN = Deno.env.get("BRIDGE_INTERNAL_TOKEN") ?? "";
const DEFAULT_INVENTORY = Deno.env.get("BASE_POLZOO_INVENTORY_ID") ?? "";
const DEFAULT_PRICE_GROUP = Deno.env.get("BASE_POLZOO_PRICE_GROUP_ID") ?? "";
const DEFAULT_WAREHOUSE = Deno.env.get("BASE_POLZOO_WAREHOUSE_ID") ?? "";
const DEFAULT_MARKUP = Number(Deno.env.get("POLZOO_MARKUP_PERCENT") ?? "0");
const SUNRISE_SELLER = "11111111-1111-1111-1111-111111111111";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
let lastBaseCallAt = 0;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY")!,
  { db: { schema: "market" } },
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorized(req: Request): Promise<boolean> {
  if (BRIDGE_TOKEN && safeEqual(req.headers.get("x-bridge-token") ?? "", BRIDGE_TOKEN)) return true;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return false;
  const user = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { db: { schema: "market" }, global: { headers: { Authorization: auth } } },
  );
  const { data } = await user.rpc("ami_operator");
  return data === true;
}

async function baseCall(method: string, parameters: Record<string, unknown> = {}) {
  const waitMs = Math.max(0, 650 - (Date.now() - lastBaseCallAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastBaseCallAt = Date.now();
  const body = new URLSearchParams({ method, parameters: JSON.stringify(parameters) });
  const res = await fetch(BASE_API_URL, {
    method: "POST",
    headers: { "X-BLToken": BASE_TOKEN, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await res.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error(`Base ${res.status}: invalid JSON`); }
  if (!res.ok || data?.status === "ERROR") {
    throw new Error(`Base ${method}: ${data?.error_message ?? data?.error_code ?? res.status}`);
  }
  return data;
}

function records(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
  return [];
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (value && typeof value === "object") {
    for (const key of ["price_brutto", "price", "value", "stock", "quantity"]) {
      if (key in (value as Record<string, unknown>)) return numberValue((value as any)[key]);
    }
  }
  return 0;
}

function selectedNumber(value: unknown, selectedKey: string, sum = false): number {
  if (typeof value === "number" || typeof value === "string") return numberValue(value);
  if (!value || typeof value !== "object") return 0;
  const obj = value as Record<string, unknown>;
  if (selectedKey && selectedKey in obj) return numberValue(obj[selectedKey]);
  const nums = Object.values(obj).map(numberValue).filter((n) => n > 0);
  return sum ? nums.reduce((a, b) => a + b, 0) : (nums[0] ?? 0);
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function textField(fields: any, key: string): string {
  if (!fields || typeof fields !== "object") return "";
  if (typeof fields[key] === "string") return cleanText(fields[key]);
  for (const value of Object.values(fields)) {
    if (value && typeof value === "object" && typeof (value as any)[key] === "string") {
      return cleanText((value as any)[key]);
    }
  }
  return "";
}

function imageUrls(images: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(visit);
  };
  visit(images);
  return [...new Set(out)].slice(0, 10);
}

function nicePrice(value: number): number {
  if (value <= 0) return 0;
  const rounded = Math.ceil(value);
  return Math.max(0.01, rounded - 0.01);
}

function classifySlug(haystack: string): string {
  const s = haystack.toLocaleLowerCase("pl-PL");
  const cat = /(kot|koci|kuwet|drapak)/.test(s);
  const dog = /(pies|psa|psi|smycz|obroż|szelk)/.test(s);
  if (/akwari|ryb|filtr.*wod/.test(s)) {
    if (/filtr/.test(s)) return "zwierzeta-akwarystyka-filtry";
    if (/dekor|roślin|kamie|żwir/.test(s)) return "zwierzeta-akwarystyka-dekoracje";
    if (/pokarm|karma/.test(s)) return "zwierzeta-akwarystyka-pokarm";
    return "zwierzeta-akwarystyka";
  }
  if (/terrari|gad|reptil/.test(s)) return "zwierzeta-inne-zwierzeta-terrarystyka";
  if (/gryzo|chomik|królik|mysz|szczur|śwink.*morsk/.test(s)) return "zwierzeta-inne-zwierzeta-gryzonie";
  if (/ptak|papug|kanar/.test(s)) return "zwierzeta-inne-zwierzeta-ptaki";
  if (cat && /karma|pokarm|przysmak/.test(s)) return "zwierzeta-kot-karma";
  if (dog && /karma|pokarm|przysmak/.test(s)) return "zwierzeta-pies-karma";
  if (cat && /drapak/.test(s)) return "zwierzeta-kot-drapaki";
  if (cat && /kuwet|żwirek/.test(s)) return "zwierzeta-kot-kuwety";
  if (cat && /zabaw/.test(s)) return "zwierzeta-kot-zabawki";
  if (dog && /zabaw/.test(s)) return "zwierzeta-pies-zabawki";
  if (dog && /smycz|obroż|szelk/.test(s)) return "zwierzeta-pies-smycze";
  if (dog && /legow|posłan|mata/.test(s)) return "zwierzeta-pies-poslania";
  if (dog && /higien|szampon|pielęgn/.test(s)) return "zwierzeta-pies-higiena";
  if (cat) return "zwierzeta-kot";
  if (dog) return "zwierzeta-pies";
  return "zwierzeta";
}

function pickInventory(inventories: any[], requested: string): any | null {
  if (requested) return inventories.find((x) => String(x.inventory_id ?? x.id) === requested) ?? null;
  return inventories.find((x) => /polzoo/i.test(String(x.name ?? ""))) ?? (inventories.length === 1 ? inventories[0] : null);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  if (!BASE_TOKEN) return json({ error: "Brak sekretu BASE_API_TOKEN" }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === "probe" ? "probe" : "sync";
    const markup = Number(body.markup_percent ?? DEFAULT_MARKUP);
    const activate = body.activate === true;
    const maxPages = Math.min(Math.max(Number(body.max_pages ?? 1), 1), 100);
    if (!Number.isFinite(markup) || markup < 0 || markup > 500) return json({ error: "Nieprawidłowa marża" }, 400);
    if (activate && markup <= 0) return json({ error: "Aktywacja wymaga dodatniej marży" }, 400);

    const inventoryResponse = await baseCall("getInventories");
    const inventories = records(inventoryResponse.inventories);
    if (action === "probe") {
      return json({
        ok: true,
        connected: true,
        inventories: inventories.map((x) => ({ id: x.inventory_id ?? x.id, name: x.name })),
      });
    }

    const requestedInventory = String(body.inventory_id ?? DEFAULT_INVENTORY);
    const inventory = pickInventory(inventories, requestedInventory);
    if (!inventory) {
      return json({ error: "Nie znaleziono jednoznacznego magazynu PolZoo", inventories: inventories.map((x) => ({ id: x.inventory_id ?? x.id, name: x.name })) }, 409);
    }
    const inventoryId = Number(inventory.inventory_id ?? inventory.id);
    const priceGroup = String(body.price_group_id ?? DEFAULT_PRICE_GROUP);
    const warehouse = String(body.warehouse_id ?? DEFAULT_WAREHOUSE);

    const [baseCategories, marketCategories] = await Promise.all([
      baseCall("getInventoryCategories", { inventory_id: inventoryId }),
      sb.from("categories").select("id,slug").like("slug", "zwierzeta%"),
    ]);
    if (marketCategories.error) throw marketCategories.error;
    const categoryIds = Object.fromEntries((marketCategories.data ?? []).map((x: any) => [x.slug, x.id]));
    if (!categoryIds.zwierzeta) throw new Error("Brak głównej kategorii Zwierzęta");
    const baseCategoryNames: Record<string, string> = {};
    for (const c of records(baseCategories.categories)) baseCategoryNames[String(c.category_id ?? c.id)] = String(c.name ?? "");

    const productIds: number[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const listed = await baseCall("getInventoryProductsList", { inventory_id: inventoryId, page });
      const products = listed.products ?? {};
      const ids = Array.isArray(products)
        ? products.map((p) => Number(p.id ?? p.product_id))
        : Object.keys(products).map(Number);
      const valid = ids.filter(Number.isFinite);
      productIds.push(...valid);
      if (valid.length < 1000) break;
    }

    let created = 0, updated = 0, skipped = 0, images = 0;
    const errors: { product_id: number; error: string }[] = [];
    for (let i = 0; i < productIds.length; i += 100) {
      const ids = productIds.slice(i, i + 100);
      const response = await baseCall("getInventoryProductsData", { inventory_id: inventoryId, products: ids });
      const products = response.products ?? {};
      const { data: maps, error: mapError } = await sb.from("base_polzoo_product_map")
        .select("offer_id,base_product_id")
        .eq("inventory_id", inventoryId)
        .in("base_product_id", ids);
      if (mapError) throw mapError;
      const byProduct = new Map((maps ?? []).map((m: any) => [Number(m.base_product_id), m.offer_id]));

      for (const id of ids) {
        try {
          const p = products[String(id)] ?? records(products).find((x) => Number(x.id ?? x.product_id) === id);
          if (!p) { skipped++; continue; }
          const title = textField(p.text_fields, "name") || cleanText(p.name);
          const description = textField(p.text_fields, "description") || cleanText(p.description);
          const supplierPrice = selectedNumber(p.prices ?? p.price, priceGroup, false);
          // Without an explicitly selected Base warehouse, prefer one source instead of
          // summing warehouses that can mirror the same supplier stock.
          const stock = Math.max(0, Math.floor(selectedNumber(p.stock ?? p.quantity, warehouse, false)));
          const urls = imageUrls(p.images);
          if (!title || supplierPrice <= 0) { skipped++; continue; }
          const price = nicePrice(supplierPrice * (1 + markup / 100));
          const baseCategory = baseCategoryNames[String(p.category_id)] ?? "";
          const slug = classifySlug(`${baseCategory} ${title}`);
          const categoryId = categoryIds[slug] ?? categoryIds.zwierzeta;
          const existingOfferId = byProduct.get(id);
          const attrs = {
            source: "polzoo_base",
            base_inventory_id: inventoryId,
            base_product_id: id,
            base_category: baseCategory,
            supplier_price_gross_pln: supplierPrice,
            markup_percent: markup,
            sku: p.sku ?? null,
            ean: p.ean ?? null,
            weight_kg: numberValue(p.weight),
            dimensions_cm: { width: numberValue(p.width), height: numberValue(p.height), length: numberValue(p.length) },
            delivery: "shipping",
          };
          const nextStatus = activate ? (stock > 0 ? "active" : "sold_out") : "draft";
          let offerId = existingOfferId;
          if (offerId) {
            const patch: Record<string, unknown> = { title, description, price_gross: price, stock, image_url: urls[0] ?? null, category_id: categoryId, attributes: attrs, updated_at: new Date().toISOString() };
            if (activate) patch.status = nextStatus;
            const { error } = await sb.from("offers").update(patch).eq("id", offerId);
            if (error) throw error;
            updated++;
          } else {
            const { data: inserted, error } = await sb.from("offers").insert({
              seller_id: SUNRISE_SELLER,
              category_id: categoryId,
              title,
              description,
              price_gross: price,
              currency: "PLN",
              stock,
              status: nextStatus,
              image_url: urls[0] ?? null,
              attributes: attrs,
              fulfillment_provider: "polzoo",
              commission_model: "cashback_only",
            }).select("id").single();
            if (error || !inserted?.id) throw error ?? new Error("Nie utworzono oferty");
            offerId = inserted.id;
            created++;
          }
          const { error: upsertError } = await sb.from("base_polzoo_product_map").upsert({
            offer_id: offerId,
            inventory_id: inventoryId,
            base_product_id: id,
            sku: p.sku || null,
            ean: p.ean || null,
            active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "inventory_id,base_product_id" });
          if (upsertError) throw upsertError;
          if (offerId && urls.length) {
            const rows = urls.map((url, sort) => ({ offer_id: offerId, url, sort }));
            const { error } = await sb.from("offer_images").upsert(rows, { onConflict: "offer_id,url", ignoreDuplicates: true });
            if (!error) images += rows.length;
          }
        } catch (error) {
          errors.push({ product_id: id, error: String((error as Error)?.message ?? error).slice(0, 240) });
        }
      }
    }

    return json({ ok: errors.length === 0, inventory: { id: inventoryId, name: inventory.name }, fetched: productIds.length, created, updated, skipped, images, draft_mode: !activate, errors: errors.slice(0, 25) });
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error).slice(0, 500) }, 500);
  }
});
