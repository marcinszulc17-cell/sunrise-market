import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const HUB_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function servicePost(path: string, body: unknown) {
  const response = await fetch(`${HUB_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sunrise-Service-Token": SERVICE_TOKEN ?? "",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SERVICE_TOKEN) return json({ error: "Brak konfiguracji Sunrise Pay" }, 503);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ error: "Brak autoryzacji" }, 401);

    const email = user.email.trim().toLowerCase();

    // Najpierw ustalamy kanoniczny identyfikator konta Sunrise. Market ma własny
    // auth, więc lokalny UUID nie może służyć do rozpoznawania portfela.
    let canonicalRef = "";
    try {
      const access = await servicePost("market-customer-access", { email });
      if (access.response.ok && access.data?.ok && access.data?.registered && access.data?.user_id) {
        canonicalRef = String(access.data.user_id);
      }
    } catch {
      // Fallback po e-mailu zachowuje kompatybilność podczas chwilowej awarii bridge'a.
    }

    const refs = Array.from(new Set([canonicalRef, email].filter(Boolean)));
    let lastData: any = null;
    let lastStatus = 502;

    for (const userRef of refs) {
      const { response, data } = await servicePost("pay-balance", { user_ref: userRef });
      lastData = data;
      lastStatus = response.status;
      if (response.ok && data?.ok) {
        return json({
          linked: true,
          balance: Number(data.balance_grosz ?? 0) / 100,
          points: Number(data.points ?? 0),
          gold: data.gold_pay_units != null ? Number(data.gold_pay_units) : null,
          currency: data.currency ?? "PLN",
        });
      }
      if (data?.error !== "user_not_found") break;
    }

    if (lastData?.error === "user_not_found") {
      return json({ linked: false, balance: 0, points: 0, gold: null, currency: "PLN", reason: "account_not_resolved" });
    }
    return json({ error: lastData?.message ?? lastData?.error ?? `Sunrise Pay ${lastStatus}` }, 502);
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 500);
  }
});
