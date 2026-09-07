// Base inventory -> Sunrise Market catalog.
// Products are drafts by default. Activation requires an explicit positive markup.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE_API_URL = "https://api.baselinker.com/connector.php";
const BASE_TOKEN = Deno.env.get("BASE_API_TOKEN") ?? "";
const BRIDGE_TOKEN = Deno.env.get("BRIDGE_INTERNAL_TOKEN") ?? "";
const DEFAULT_INVENTORY = Deno.env.get("BASE_POLZOO_INVENTORY_ID") ?? "";
const DEFAULT_PRICE_GROUP = Deno.env.get("BASE_POLZOO_PRICE_GROUP_ID") ?? "";
const DEFAULT_WAREHOUSE = Deno.env.get("BASE_POLZOO_WAREHOUSE_ID") ?? "";
const SUNRISE_SELLER = "11111111-1111-1111-1111-111111111111";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-token, x-sunrise-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
let lastBaseCallAt = 0;

type SupplierKey = "polzoo" | "euroshop" | "eet";
type SupplierConfig = {
  key: SupplierKey;
  source: string;
  provider: string;
  categoryPrefix: string;
  fallbackCategory: string;
  defaultMarkup: number;
};

const SUPPLIERS: Record<SupplierKey, SupplierConfig> = {
  polzoo: {
    key: "polzoo",
    source: "polzoo_base",
    provider: "polzoo",
    categoryPrefix: "zwierzeta%",
    fallbackCategory: "zwierzeta",
    defaultMarkup: Number(Deno.env.get("POLZOO_MARKUP_PERCENT") ?? "0"),
  },
  euroshop: {
    key: "euroshop",
    source: "euroshop_base",
    provider: "euroshop",
    categoryPrefix: "supermarket%",
    fallbackCategory: "supermarket-chemia",
    defaultMarkup: Number(Deno.env.get("EUROSHOP_MARKUP_PERCENT") ?? "0"),
  },
  eet: {
    key: "eet",
    source: "eet_base",
    provider: "eet",
    categoryPrefix: "komputery-i-biuro%",
    fallbackCategory: "komputery-i-biuro",
    defaultMarkup: Number(Deno.env.get("EET_MARKUP_PERCENT") ?? "0"),
  },
};

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

/** Wspólny sekret operacyjny ekosystemu (env albo market.internal_secrets) — jak w pozostałych funkcjach. */
async function serviceToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN") ?? "";
  if (fromEnv) return fromEnv;
  const { data } = await sb.from("internal_secrets").select("value").eq("key", "sunrise_pay_service_token").maybeSingle();
  return String(data?.value ?? "");
}

async function authorized(req: Request): Promise<boolean> {
  if (BRIDGE_TOKEN && safeEqual(req.headers.get("x-bridge-token") ?? "", BRIDGE_TOKEN)) return true;
  const service = req.headers.get("x-sunrise-service-token") ?? "";
  if (service && safeEqual(service, await serviceToken())) return true;
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

function classifyPolzoo(haystack: string): string {
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

function classifyEuroshop(haystack: string): string {
  const s = haystack.toLocaleLowerCase("pl-PL");
  if (/folia alumini|jednoraz|papier śniadani|woreczk/.test(s)) return "supermarket-artykuly-domowe-jednorazowe";
  if (/prani|wasch|płuk|pluk|weichspül|softener|lenor|gama|zagniece|crease|felce azzurra|kuschelweich/.test(s)) return "supermarket-chemia-pranie";
  if (/dove|palmolive|żel pod prysznic|zel pod prysznic|balsam|kosmet|ciał|cial|szampon|mydł|mydl/.test(s)) return "supermarket-chemia-kosmetyki";
  if (/naczyn|zmywan|spül|spul/.test(s)) return "supermarket-chemia-zmywanie";
  return "supermarket-chemia-czystosc";
}

/** EET Polska to dystrybutor IT (sieci, komponenty, peryferia, biuro) — nie chemia. */
function classifyEet(haystack: string): string {
  const s = haystack.toLocaleLowerCase("pl-PL");
  if (/toner|tusz|kartrid|b\u0119ben|drum|ribbon|photoconduct|cartridge/.test(s)) return "komputery-i-biuro-biuro-tonery";
  if (/niszczark/.test(s)) return "komputery-i-biuro-biuro-niszczarki";
  if (/papier/.test(s)) return "komputery-i-biuro-biuro-papier";
  if (/switch|prze\u0142\u0105cznik sieciow/.test(s)) return "komputery-i-biuro-sieci-switche";
  if (/router|access point|punkt dost\u0119pow/.test(s)) return "komputery-i-biuro-sieci-routery";
  if (/karta sieciow|nic |ethernet adapter/.test(s)) return "komputery-i-biuro-sieci-karty-sieciowe";
  if (/\u015bwiat\u0142ow|patchcord|patch cord|kabel|przew\u00f3d|hdmi|displayport|usb-c|usb |rj45|skr\u0119tk/.test(s)) return "komputery-i-biuro-sieci-kable";
  if (/dysk|ssd|hdd|nvme/.test(s)) return "komputery-i-biuro-komponenty-dyski-ssd";
  if (/pami\u0119\u0107|ram |ddr[2-5]|sodimm/.test(s)) return "komputery-i-biuro-komponenty-pamiec-ram";
  if (/zasilacz|psu |power supply/.test(s)) return "komputery-i-biuro-komponenty-zasilacze";
  if (/procesor|cpu /.test(s)) return "komputery-i-biuro-komponenty-procesory";
  if (/p\u0142yta g\u0142\u00f3wna|motherboard/.test(s)) return "komputery-i-biuro-komponenty-plyty-glowne";
  if (/karta graficzna|gpu /.test(s)) return "komputery-i-biuro-komponenty-karty-graficzne";
  if (/klawiatur/.test(s)) return "komputery-i-biuro-peryferia-klawiatury";
  if (/mysz/.test(s)) return "komputery-i-biuro-peryferia-myszy";
  if (/monitor/.test(s)) return "komputery-i-biuro-peryferia-monitory";
  if (/drukark|ploter/.test(s)) return "komputery-i-biuro-peryferia-drukarki";
  if (/skaner/.test(s)) return "komputery-i-biuro-peryferia-skanery";
  if (/webcam|kamera internetow/.test(s)) return "komputery-i-biuro-peryferia-webcam";
  if (/ramka|kiesze|tacka|tray|obudow|adapter|z\u0142\u0105cz|listwa|mocowanie|uchwyt/.test(s)) return "komputery-i-biuro-komponenty";
  if (/laptop|notebook/.test(s)) return "komputery-i-biuro";
  return "komputery-i-biuro";
}

function classifySlug(supplier: SupplierKey, haystack: string): string {
  if (supplier === "polzoo") return classifyPolzoo(haystack);
  if (supplier === "eet") return classifyEet(haystack);
  return classifyEuroshop(haystack);
}

function pickInventory(inventories: any[], requested: string): any | null {
  if (requested) return inventories.find((x) => String(x.inventory_id ?? x.id) === requested) ?? null;
  return inventories.find((x) => /polzoo/i.test(String(x.name ?? ""))) ?? (inventories.length === 1 ? inventories[0] : null);
}

function requestedProductIds(value: unknown): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error("product_ids musi być tablicą");
  const ids = [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) throw new Error("product_ids nie zawiera poprawnych ID");
  if (ids.length > 1000) throw new Error("Jednorazowo można synchronizować maksymalnie 1000 produktów");
  return ids;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  if (!BASE_TOKEN) return json({ error: "Brak sekretu BASE_API_TOKEN" }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === "probe" ? "probe" : body.action === "preview" ? "preview" : body.action === "scan" ? "scan" : "sync";
    const supplierKey = String(body.supplier ?? "polzoo").toLowerCase() as SupplierKey;
    const supplier = SUPPLIERS[supplierKey];
    if (!supplier) return json({ error: "Nieobsługiwany dostawca", allowed_suppliers: Object.keys(SUPPLIERS) }, 400);
    const markup = Number(body.markup_percent ?? supplier.defaultMarkup);
    const activate = body.activate === true;
    const maxPages = Math.min(Math.max(Number(body.max_pages ?? 1), 1), 100);
    const explicitProductIds = requestedProductIds(body.product_ids);
    // Sufit z ceny rynkowej i prog rentownosci (decyzja wlasciciela 2026-09-07 po badaniu cen).
    const capRatio = Math.min(Math.max(Number(body.price_cap_ratio ?? 0.95), 0.5), 1);
    const minMargin = Math.min(Math.max(Number(body.min_margin_percent ?? 8), 0), 90);
    // Tanie pozycje musza zarobic wiecej, bo koszt wysylki jest staly (decyzja wlasciciela 2026-09-07).
    const minMarginSmall = Math.min(Math.max(Number(body.min_margin_small_percent ?? 15), 0), 90);
    const smallBelow = Math.max(0, Number(body.small_price_below ?? 100));
    // Prog liczymy od marzy NETTO: cashback 3% brutto placimy my, do tego prowizja platnosci
    // i ewentualna doplata do wysylki (decyzja wlasciciela 2026-09-07).
    const cashbackPct = Math.min(Math.max(Number(body.cashback_percent ?? 3), 0), 50);
    const feePct = Math.min(Math.max(Number(body.payment_fee_percent ?? 2), 0), 50);
    const feeFixed = Math.max(0, Number(body.payment_fee_fixed_pln ?? 1));
    const shippingCost = Math.max(0, Number(body.shipping_cost_pln ?? 0));
    if (!Number.isFinite(markup) || markup < 0 || markup > 500) return json({ error: "Nieprawidłowa marża" }, 400);
    if (activate && markup <= 0) return json({ error: "Aktywacja wymaga dodatniej marży" }, 400);

    const inventoryResponse = await baseCall("getInventories");
    const inventories = records(inventoryResponse.inventories);
    if (action === "probe") {
      return json({
        ok: true,
        connected: true,
        supplier: supplier.key,
        inventories: inventories.map((x) => ({ id: x.inventory_id ?? x.id, name: x.name })),
      });
    }

    const requestedInventory = String(body.inventory_id ?? DEFAULT_INVENTORY);
    const inventory = pickInventory(inventories, requestedInventory);
    if (!inventory) {
      return json({ error: "Nie znaleziono wskazanego magazynu Base", inventories: inventories.map((x) => ({ id: x.inventory_id ?? x.id, name: x.name })) }, 409);
    }
    const inventoryId = Number(inventory.inventory_id ?? inventory.id);
    const priceGroup = String(body.price_group_id ?? DEFAULT_PRICE_GROUP);
    const warehouse = String(body.warehouse_id ?? DEFAULT_WAREHOUSE);

    // Skan katalogu bez zapisu — liczby do decyzji o kolejnej partii (kontrola jakosci przed importem).
    if (action === "scan") {
      const brands: string[] = (Array.isArray(body.brands) ? body.brands : []).map((x: unknown) => String(x));
      const counts: Record<string, number> = {};
      let total = 0, withEan = 0, inStock = 0, priced = 0;
      const buckets: Record<string, number> = { "0-50": 0, "50-100": 0, "100-300": 0, "300-1000": 0, "1000+": 0 };
      const sampleRaw: unknown[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const listed = await baseCall("getInventoryProductsList", { inventory_id: inventoryId, page });
        const raw = listed.products ?? {};
        const rows = Array.isArray(raw) ? raw : Object.values(raw);
        for (const p of rows as Record<string, unknown>[]) {
          total++;
          if (sampleRaw.length < 3) sampleRaw.push(p);
          const name = cleanText((p as any).name ?? "");
          if ((p as any).ean) withEan++;
          const stock = Math.max(0, Math.floor(selectedNumber((p as any).stock ?? (p as any).quantity, warehouse, false)));
          if (stock > 0) inStock++;
          const price = selectedNumber((p as any).prices ?? (p as any).price, priceGroup, false);
          if (price > 0) {
            priced++;
            const b = price < 50 ? "0-50" : price < 100 ? "50-100" : price < 300 ? "100-300" : price < 1000 ? "300-1000" : "1000+";
            buckets[b]++;
          }
          for (const brand of brands) {
            if (name.toLowerCase().includes(brand.toLowerCase())) counts[brand] = (counts[brand] ?? 0) + 1;
          }
        }
        if (rows.length < 1000) break;
      }
      return json({
        ok: true, supplier: supplier.key, inventory: { id: inventoryId, name: inventory.name },
        total, with_ean: withEan, in_stock: inStock, priced, price_buckets: buckets,
        brand_counts: counts, pages_scanned: Math.min(maxPages, Math.ceil(total / 1000)), sample_raw: sampleRaw,
      });
    }

    const [baseCategories, marketCategories] = await Promise.all([
      baseCall("getInventoryCategories", { inventory_id: inventoryId }),
      sb.from("categories").select("id,slug").like("slug", supplier.categoryPrefix),
    ]);
    if (marketCategories.error) throw marketCategories.error;
    const categoryIds = Object.fromEntries((marketCategories.data ?? []).map((x: any) => [x.slug, x.id]));
    if (!categoryIds[supplier.fallbackCategory]) throw new Error(`Brak kategorii ${supplier.fallbackCategory}`);
    const baseCategoryNames: Record<string, string> = {};
    for (const c of records(baseCategories.categories)) baseCategoryNames[String(c.category_id ?? c.id)] = String(c.name ?? "");

    const productIds: number[] = explicitProductIds ? [...explicitProductIds] : [];
    if (!explicitProductIds) {
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
    }

    // Podgląd bez zapisu — do wyboru kontrolnej partii przed importem.
    if (action === "preview") {
      const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);
      const offset = Math.max(0, Number(body.offset ?? 0));
      const ids = productIds.slice(offset, offset + 100);
      const response = ids.length ? await baseCall("getInventoryProductsData", { inventory_id: inventoryId, products: ids }) : { products: {} };
      const products = response.products ?? {};
      const rows: any[] = [];
      for (const id of ids) {
        const p = products[String(id)] ?? records(products).find((x) => Number(x.id ?? x.product_id) === id);
        if (!p) continue;
        const title = textField(p.text_fields, "name") || cleanText(p.name);
        const supplierPrice = selectedNumber(p.prices ?? p.price, priceGroup, false);
        const stock = Math.max(0, Math.floor(selectedNumber(p.stock ?? p.quantity, warehouse, false)));
        const urls = imageUrls(p.images);
        const baseCategory = baseCategoryNames[String(p.category_id)] ?? "";
        rows.push({
          id, title, base_category: baseCategory, supplier_price_gross_pln: supplierPrice, stock,
          images: urls.length, sku: p.sku ?? null, ean: p.ean ?? null,
          suggested_category: classifySlug(supplier.key, `${baseCategory} ${title}`),
        });
      }
      const usable = rows.filter((r) => r.title && r.supplier_price_gross_pln > 0 && r.stock > 0 && r.images > 0);
      return json({ ok: true, supplier: supplier.key, inventory: { id: inventoryId, name: inventory.name }, listed: productIds.length, inspected: rows.length, usable: usable.length, sample: usable.slice(0, limit) });
    }

    let created = 0, updated = 0, skipped = 0, images = 0, held = 0;
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
      const offerIds = [...byProduct.values()].filter(Boolean);
      const prevAttrs = new Map<string, Record<string, unknown>>();
      if (offerIds.length) {
        const { data: prev } = await sb.from("offers").select("id,attributes").in("id", offerIds);
        for (const row of prev ?? []) prevAttrs.set(String((row as any).id), ((row as any).attributes ?? {}) as Record<string, unknown>);
      }

      for (const id of ids) {
        try {
          const p = products[String(id)] ?? records(products).find((x) => Number(x.id ?? x.product_id) === id);
          if (!p) { skipped++; continue; }
          const title = textField(p.text_fields, "name") || cleanText(p.name);
          const description = textField(p.text_fields, "description") || cleanText(p.description);
          const supplierPrice = selectedNumber(p.prices ?? p.price, priceGroup, false);
          const stock = Math.max(0, Math.floor(selectedNumber(p.stock ?? p.quantity, warehouse, false)));
          const urls = imageUrls(p.images);
          if (!title || supplierPrice <= 0) { skipped++; continue; }
          const existingOfferIdEarly = byProduct.get(id);
          const keep = existingOfferIdEarly ? (prevAttrs.get(String(existingOfferIdEarly)) ?? {}) : {};
          const marketLowest = Number(keep.market_lowest_pln ?? 0);
          let price = nicePrice(supplierPrice * (1 + markup / 100));
          let priceSource = "markup";
          if (marketLowest > 0) {
            const capped = nicePrice(marketLowest * capRatio);
            if (capped < price) { price = capped; priceSource = "market_cap"; }
          }
          const marginPct = supplierPrice > 0 ? ((price - supplierPrice) / supplierPrice) * 100 : 0;
          // Koszty, ktore ponosimy od kazdej sprzedazy: cashback 3% brutto, prowizja platnosci, wysylka.
          const cashbackCost = price * (cashbackPct / 100);
          const feeCost = price * (feePct / 100) + feeFixed;
          const netProfit = price - supplierPrice - cashbackCost - feeCost - shippingCost;
          const netMarginPct = supplierPrice > 0 ? (netProfit / supplierPrice) * 100 : 0;
          const requiredMargin = supplierPrice < smallBelow ? minMarginSmall : minMargin;
          const belowMinMargin = netMarginPct < requiredMargin;
          const baseCategory = baseCategoryNames[String(p.category_id)] ?? "";
          const slug = classifySlug(supplier.key, `${baseCategory} ${title}`);
          const categoryId = categoryIds[slug] ?? categoryIds[supplier.fallbackCategory];
          const existingOfferId = existingOfferIdEarly;
          const attrs = {
            ...keep,
            source: supplier.source,
            supplier_key: supplier.key,
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
            price_source: priceSource,
            margin_percent: Math.round(marginPct * 10) / 10,
            net_margin_percent: Math.round(netMarginPct * 10) / 10,
            net_profit_pln: Math.round(netProfit * 100) / 100,
            cashback_percent: cashbackPct,
            min_margin_required: requiredMargin,
          };
          // Bez ustalonej, dodatniej marzy oferta zostaje szkicem — nawet przy activate:true.
          const nextStatus = activate && !belowMinMargin ? (stock > 0 ? "active" : "sold_out") : "draft";
          if (activate && belowMinMargin) held++;
          let offerId = existingOfferId;
          if (offerId) {
            const patch: Record<string, unknown> = { title, description, price_gross: price, stock, image_url: urls[0] ?? null, category_id: categoryId, attributes: attrs, fulfillment_provider: supplier.provider, updated_at: new Date().toISOString() };
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
              fulfillment_provider: supplier.provider,
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

    return json({ ok: errors.length === 0, supplier: supplier.key, inventory: { id: inventoryId, name: inventory.name }, fetched: productIds.length, created, updated, skipped, images, held_low_margin: held, price_cap_ratio: capRatio, min_margin_percent: minMargin, min_margin_small_percent: minMarginSmall, small_price_below: smallBelow, cashback_percent: cashbackPct, payment_fee_percent: feePct, payment_fee_fixed_pln: feeFixed, shipping_cost_pln: shippingCost, margin_basis: "net", draft_mode: !activate, errors: errors.slice(0, 25) });
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error).slice(0, 500) }, 500);
  }
});
