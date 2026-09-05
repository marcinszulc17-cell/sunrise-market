// ref-attribute — przypina zalogowanego klienta marketu do ambasadora po kodzie referencyjnym (push do MySunrise).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user?.email) return json({ ok: false, error: "brak autoryzacji" }, 401);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    if (!code) return json({ ok: false, error: "brak kodu" }, 400);
    const r = await fetch(`${PAY_BASE}/mkt-referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
      body: JSON.stringify({ action: "attribute", email: user.email, code, source: "sunrise_market" }),
    });
    const d = await r.json().catch(() => ({ ok: false }));
    return json(d);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
