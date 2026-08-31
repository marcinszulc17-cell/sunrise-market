// teemdrop-bridge: przetwarza zakolejkowane zamówienia dropship i wypycha je do headless WooCommerce.
// Wyzwalane przez pg_cron (co 1 min) lub ręcznie z panelu operatora. Idempotencja po order_id (unique).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WOO = Deno.env.get('WOO_BASE_URL') ?? '';
const CK = Deno.env.get('WOO_CONSUMER_KEY') ?? '';
const CS = Deno.env.get('WOO_CONSUMER_SECRET') ?? '';
const BRIDGE_TOKEN = Deno.env.get('BRIDGE_INTERNAL_TOKEN') ?? '';
const MAX_RETRY = 3;

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!,
  { db: { schema: 'market' } },
);

function splitName(full: string | null): [string, string] {
  const s = (full ?? '').trim();
  if (!s) return ['Klient', 'Sunrise'];
  const p = s.split(/\s+/);
  return p.length === 1 ? [p[0], '-'] : [p.slice(0, -1).join(' '), p[p.length - 1]];
}

async function pushOrder(row: any): Promise<{ ok: boolean; wooId?: number; err?: string }> {
  const { data: order, error: oErr } = await sb.from('orders').select('*').eq('id', row.order_id).single();
  if (oErr || !order) return { ok: false, err: 'Zamówienie nie znalezione' };
  if (!order.ship_name || !order.ship_street || !order.ship_city || !order.ship_postal) {
    return { ok: false, err: 'Brak adresu dostawy w zamówieniu' };
  }

  const { data: items, error: iErr } = await sb
    .from('order_items')
    .select('qty, offer_id, offers!inner(fulfillment_provider), teemdrop_product_map:offer_id(woo_product_id, woo_variation_id, active)')
    .eq('order_id', row.order_id);
  if (iErr) return { ok: false, err: 'Błąd pobierania pozycji: ' + iErr.message };

  const lineItems: any[] = [];
  for (const it of (items ?? [])) {
    const prov = (it as any).offers?.fulfillment_provider;
    if (prov !== 'teemdrop') continue;
    const map = Array.isArray((it as any).teemdrop_product_map) ? (it as any).teemdrop_product_map[0] : (it as any).teemdrop_product_map;
    if (!map || !map.woo_product_id || map.active === false) {
      return { ok: false, err: 'Brak mapowania Woo dla oferty ' + it.offer_id };
    }
    const li: any = { product_id: map.woo_product_id, quantity: it.qty };
    if (map.woo_variation_id) li.variation_id = map.woo_variation_id;
    lineItems.push(li);
  }
  if (lineItems.length === 0) return { ok: false, err: 'Brak pozycji dropship do wysłania' };

  const [fn, ln] = splitName(order.ship_name);
  const addr = {
    first_name: fn, last_name: ln,
    address_1: order.ship_street, city: order.ship_city,
    postcode: order.ship_postal, country: order.ship_country ?? 'PL',
    phone: order.ship_phone ?? '',
  };
  const payload = {
    status: 'processing',
    set_paid: true,
    billing: { ...addr, email: 'orders@sunrisemarket.pl' },
    shipping: addr,
    line_items: lineItems,
    customer_note: 'Sunrise Market #' + String(row.order_id).slice(0, 8),
    meta_data: [{ key: 'sunrise_order_id', value: row.order_id }],
  };

  const res = await fetch(`${WOO}/wp-json/wc/v3/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${CK}:${CS}`),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, err: `Woo ${res.status}: ${t.slice(0, 300)}` };
  }
  const wooOrder = await res.json();
  return { ok: true, wooId: wooOrder.id };
}

Deno.serve(async (req) => {
  if (BRIDGE_TOKEN && req.headers.get('x-bridge-token') !== BRIDGE_TOKEN) {
    return new Response('unauthorized', { status: 401 });
  }

  // Read the queue before requiring Woo credentials. An idle cron tick must stay healthy.
  const { data: pending, error } = await sb
    .from('teemdrop_bridge_orders')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRY)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  if (!pending?.length) {
    return new Response(JSON.stringify({ processed: 0, results: [], configured: Boolean(WOO && CK && CS) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (!WOO || !CK || !CS) {
    return new Response(JSON.stringify({ error: 'Brak konfiguracji WOO_* (ustaw sekrety w Supabase)', pending: pending.length }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const results: any[] = [];
  for (const row of pending) {
    try {
      const r = await pushOrder(row);
      if (r.ok) {
        await sb.from('teemdrop_bridge_orders').update({
          woo_order_id: r.wooId, status: 'pushed', pushed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        results.push({ order: row.order_id, ok: true, woo: r.wooId });
      } else {
        const rc = (row.retry_count ?? 0) + 1;
        await sb.from('teemdrop_bridge_orders').update({
          status: rc >= MAX_RETRY ? 'error' : 'pending', retry_count: rc, last_error: r.err, updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        results.push({ order: row.order_id, ok: false, err: r.err });
      }
    } catch (e) {
      const rc = (row.retry_count ?? 0) + 1;
      await sb.from('teemdrop_bridge_orders').update({
        status: rc >= MAX_RETRY ? 'error' : 'pending', retry_count: rc, last_error: String((e as Error).message), updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      results.push({ order: row.order_id, ok: false, err: String((e as Error).message) });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results, configured: true }), { headers: { 'Content-Type': 'application/json' } });
});
