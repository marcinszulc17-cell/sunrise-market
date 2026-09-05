// smart-subscribe — zakup abonamentu "Sunrise Smart" (darmowe wysyłki). Płatność portfelem Sunrise Pay.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
// Token serwisowy Sunrise Pay: z env, a gdy brak — z market.internal_secrets (klucz sunrise_pay_service_token).
// Bez literału w kodzie (repo jest publiczne) — 2026-09-05.
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const PAY_TOKEN = await resolveSunrisePayToken();
function json(b, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
async function uuidv5(name) {
  const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = NS.replace(/-/g, "").match(/.{2}/g).map((h) => parseInt(h, 16));
  const data = new Uint8Array([...nsBytes, ...Array.from(new TextEncoder().encode(name))]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50; hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
async function pay(path, body) {
  const r = await fetch(`${PAY_BASE}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN }, body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch { /* */ }
  return { status: r.status, data };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user || !user.email) return json({ error: "Brak autoryzacji" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL"), SERVICE_KEY, { db: { schema: "market" } });

    // już aktywny? nie pobieraj ponownie
    const { data: cur } = await sb.from("smart_members").select("expires_at,active").eq("user_id", user.id).maybeSingle();
    if (cur && cur.active && (!cur.expires_at || new Date(cur.expires_at) > new Date())) {
      return json({ ok: true, already_member: true, expires_at: cur.expires_at });
    }
    const { data: cfg } = await sb.from("platform_config").select("value").eq("key", "smart_price_pln").maybeSingle();
    const price = Number(cfg?.value ?? "59");
    const amountGrosz = Math.round(price * 100);
    const key = await uuidv5(`market:smart:${user.id}:${new Date().getUTCFullYear()}`);
    const charge = await pay("pay-charge", { user_ref: user.email, amount_grosz: amountGrosz, order_ref: `smart-${user.id}`, idempotency_key: key });
    if (charge.status === 402 || (charge.data && charge.data.ok === false && charge.data.error === "insufficient_funds")) {
      const balGr = Number(charge.data?.balance_grosz ?? 0);
      return json({ error: "Za mało środków w portfelu Sunrise Pay", need_topup: true, balance: balGr / 100, required: price }, 402);
    }
    if (charge.status !== 200 || !charge.data?.ok) return json({ error: `Płatność nieudana: ${charge.data?.message ?? charge.data?.error ?? charge.status}` }, 402);

    const expires = new Date(); expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    await sb.from("smart_members").upsert({ user_id: user.id, active: true, started_at: new Date().toISOString(), expires_at: expires.toISOString(), price_paid: price, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return json({ ok: true, active: true, expires_at: expires.toISOString(), price, balance: Number(charge.data.balance_grosz ?? 0) / 100 });
  } catch (err) { return json({ error: String(err?.message ?? err) }, 400); }
});
