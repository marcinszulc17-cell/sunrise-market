import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
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
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user?.email) return json({ club: "family", ambassador: false });
    const r = await fetch(`${PAY_BASE}/ambassador-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
      body: JSON.stringify({ user_ref: user.email }),
    });
    const d = await r.json().catch(() => ({}));
    if (d?.ok && d.is_ambassador) {
      return json({ club: "ambassador", ambassador: true, tier: d.tier, status: d.status, referral_code: d.referral_code, pearls: Number(d.pearls ?? 0), referrals: Number(d.referrals ?? 0), commissions_pln: Number(d.commissions_pln ?? 0), turnover_pln: Number(d.turnover_pln ?? 0) });
    }
    return json({ club: "family", ambassador: false, status: d?.status ?? null });
  } catch (err) {
    return json({ club: "family", ambassador: false, error: String((err as Error).message ?? err) });
  }
});
