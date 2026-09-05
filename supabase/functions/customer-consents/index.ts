// customer-consents — zgody zalogowanego klienta z jednego źródła (MySunrise: zgody_klientow + profil).
// Market nie przechowuje własnych zgód marketingowych; pokazuje tylko AKTYWNE zgody z MySunrise
// oraz akceptację regulaminu sprzedawcy zapisaną w market.sellers.terms_accepted_at.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const HUB = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? ""; const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []); return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user?.email) return json({ ok: false, error: "unauthorized" }, 401);
    const token = await resolveSunrisePayToken();
    const r = await fetch(`${HUB}/market-customer-consents`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": token }, body: JSON.stringify({ email: user.email }) });
    const d = await r.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "market" } });
    const { data: seller } = await admin.from("sellers").select("terms_accepted_at,seller_type").eq("auth_user_id", user.id).maybeSingle();
    const consents = Array.isArray(d?.consents) ? d.consents : [];
    if (seller?.terms_accepted_at) consents.unshift({ channel: "market", purpose: seller.seller_type === "business" ? "Regulamin Partnera Handlowego Sunrise Market" : "Regulamin Sprzedawcy Sunrise Market", basis: "umowa", text: "Akceptacja regulaminu sprzedaży i Sunrise Pay", since: seller.terms_accepted_at, verified: true });
    return json({ ok: true, registered: Boolean(d?.registered), consents, manage_url: "https://app.mysunrise.pl/profile" });
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
});
