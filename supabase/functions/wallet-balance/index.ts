import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!PAY_TOKEN) return json({ error: "Brak konfiguracji Sunrise Pay" }, 503);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ error: "Brak autoryzacji" }, 401);

    const response = await fetch(`${PAY_BASE}/pay-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
      body: JSON.stringify({ user_ref: user.email }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) {
      return json({
        linked: true,
        balance: Number(data.balance_grosz ?? 0) / 100,
        points: Number(data.points ?? 0),
        gold: data.gold_pay_units != null ? Number(data.gold_pay_units) : null,
        currency: data.currency ?? "PLN",
      });
    }
    if (data?.error === "user_not_found") {
      return json({ linked: false, balance: 0, points: 0, gold: null, currency: "PLN", reason: "user_not_found" });
    }
    return json({ error: data?.message ?? data?.error ?? `MySunrise ${response.status}` }, 502);
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500);
  }
});
