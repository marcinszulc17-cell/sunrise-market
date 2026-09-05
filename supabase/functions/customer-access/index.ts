import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const MYS_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
// Token serwisowy Sunrise Pay: najpierw sekret środowiskowy, potem market.internal_secrets.
// Fallback dodany 2026-09-05 — sekret SUNRISE_MARKET_SERVICE_TOKEN nie był ustawiony w projekcie,
// przez co portfel, checkout portfelem i wypłaty sprzedawców zwracały "Brak konfiguracji Sunrise Pay".
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const SERVICE_TOKEN = await resolveSunrisePayToken();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!SERVICE_TOKEN) return json({ ok: false, error: "service_token_not_configured" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ ok: false, registered: false, verified: false, reason: "unauthorized" }, 401);

    const response = await fetch(`${MYS_BASE}/market-customer-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sunrise-Service-Token": SERVICE_TOKEN,
      },
      body: JSON.stringify({ email: user.email }),
    });
    const status = await response.json().catch(() => ({}));
    if (!response.ok || status?.ok !== true) {
      return json({ ok: false, registered: false, verified: false, reason: status?.reason ?? status?.error ?? "mysunrise_unavailable" }, 502);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "market" } });
    const checkedAt = new Date().toISOString();
    const row = {
      user_id: user.id,
      email: user.email.trim().toLowerCase(),
      registered: status.registered === true,
      verified: status.verified === true,
      reason: String(status.reason ?? "unknown"),
      checked_at: checkedAt,
    };
    const { error: cacheError } = await admin.from("customer_access_cache").upsert(row, { onConflict: "user_id" });
    if (cacheError) return json({ ok: false, registered: false, verified: false, reason: "cache_failed", error: cacheError.message }, 500);

    return json({ ok: true, registered: row.registered, verified: row.verified, reason: row.reason, checked_at: checkedAt });
  } catch (error) {
    return json({ ok: false, registered: false, verified: false, reason: "internal_error", error: String((error as Error).message ?? error) }, 500);
  }
});
