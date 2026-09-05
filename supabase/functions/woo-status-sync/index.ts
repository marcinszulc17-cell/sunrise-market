// woo-status-sync: webhook z WooCommerce (order.updated). Weryfikuje podpis HMAC,
// mapuje status Woo -> Sunrise, wyciąga tracking i aktualizuje zamówienie + most.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SECRET = Deno.env.get('WOO_WEBHOOK_SECRET') ?? '';
const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!,
  { db: { schema: 'market' } },
);

async function validSig(body: string, sig: string | null): Promise<boolean> {
  if (!SECRET) return true; // brak sekretu = tryb bez weryfikacji (do konfiguracji)
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === sig;
}

function metaVal(meta: any[], keys: string[]): string | null {
  for (const k of keys) {
    const m = (meta ?? []).find((x) => x.key === k);
    if (m && m.value) return typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
  }
  return null;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  const ok = await validSig(raw, req.headers.get('x-wc-webhook-signature'));
  if (!ok) return new Response('invalid signature', { status: 401 });

  let woo: any;
  try { woo = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (!woo || !woo.id) return new Response('ok', { status: 200 }); // ping/handshake

  const sunriseOrderId = metaVal(woo.meta_data, ['sunrise_order_id']);
  if (!sunriseOrderId) return new Response('no sunrise_order_id', { status: 200 });

  // Mapowanie statusu Woo -> Sunrise
  const wooStatus = String(woo.status ?? '');
  const map: Record<string, { order?: string; bridge: string }> = {
    processing: { bridge: 'processing' },
    'on-hold':  { bridge: 'processing' },
    completed:  { order: 'shipped', bridge: 'shipped' },
    cancelled:  { bridge: 'error' },
    failed:     { bridge: 'error' },
    refunded:   { bridge: 'error' },
  };
  const target = map[wooStatus] ?? { bridge: 'processing' };

  // Tracking (różne wtyczki zapisują pod różnymi kluczami meta — best effort)
  const tracking = metaVal(woo.meta_data, ['_tracking_number', 'tracking_number', '_aftership_tracking_number', '_wc_shipment_tracking_items']);
  const carrier  = metaVal(woo.meta_data, ['_tracking_provider', 'tracking_provider', '_aftership_tracking_slug']);

  const bridgeUpd: any = { status: target.bridge, updated_at: new Date().toISOString() };
  if (tracking) bridgeUpd.tracking_number = tracking;
  if (carrier) bridgeUpd.tracking_carrier = carrier;
  await sb.from('teemdrop_bridge_orders').update(bridgeUpd).eq('order_id', sunriseOrderId);

  const orderUpd: any = {};
  if (target.order) orderUpd.status = target.order;
  if (tracking) orderUpd.tracking_no = tracking;
  if (Object.keys(orderUpd).length) {
    await sb.from('orders').update(orderUpd).eq('id', sunriseOrderId);
  }

  return new Response(JSON.stringify({ ok: true, order: sunriseOrderId, status: wooStatus }), { headers: { 'Content-Type': 'application/json' } });
});
