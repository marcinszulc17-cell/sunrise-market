import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user?.email) return json({ error: "Brak autoryzacji" }, 401);
    if (!PAY_TOKEN) return json({ available: false, reason: "service_not_configured" }, 503);

    let r: Response;
    try {
      r = await fetch(`${PAY_BASE}/pay-seller-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
        body: JSON.stringify({ seller_ref: user.email }),
      });
    } catch {
      return json({ available: false, reason: "unreachable" });
    }
    if (r.status === 404) return json({ available: false, reason: "not_implemented" });
    const d = await r.json().catch(() => ({}));
    if (d?.ok) {
      return json({
        available: true,
        sunrise_pay: Number(d.sunrise_pay_grosz ?? 0) / 100,
        gold: d.gold_pay_units != null ? Number(d.gold_pay_units) : null,
        pending: Number(d.pending_grosz ?? 0) / 100,
        withdraw_enabled: d.withdraw_enabled !== false,
      });
    }
    return json({ available: false, reason: d?.error ?? "unavailable" });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
});
