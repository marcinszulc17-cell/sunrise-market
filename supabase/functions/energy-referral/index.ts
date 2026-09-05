// energy-referral — link polecający "Polecaj Sunrise Energy" dla zalogowanego klienta Marketu.
// Wcześniej front wołał tę funkcję, ale nie była wdrożona → "Program poleceń jest chwilowo niedostępny".
// Kod: ambasador -> referral_code z Ambassador Club; klient Family Club -> sfc_referral_code z profilu MySunrise.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const REF_BASE = Deno.env.get("SUNRISE_ENERGY_REF_BASE") ?? "https://sunriseenergy.pl/?ref=";
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user?.email) return json({ available: false, reason: "unauthorized" }, 401);
    const token = await resolveSunrisePayToken();
    if (!token) return json({ available: false, reason: "service_not_configured" });
    const r = await fetch(`${PAY_BASE}/ambassador-status`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": token }, body: JSON.stringify({ user_ref: user.email }) });
    const d = await r.json().catch(() => ({}));
    const code = String((d?.is_ambassador && d?.referral_code) ? d.referral_code : (d?.sfc_referral_code ?? d?.referral_code ?? "")).trim();
    if (!code) return json({ available: false, reason: "no_code" });
    return json({ available: true, code, link: `${REF_BASE}${encodeURIComponent(code)}`, ambassador: Boolean(d?.is_ambassador), tier: d?.tier ?? null });
  } catch (err) {
    return json({ available: false, error: String((err as Error).message ?? err) }, 500);
  }
});
