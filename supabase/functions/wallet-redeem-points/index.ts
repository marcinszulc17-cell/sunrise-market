import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
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
const PAY_TOKEN = await resolveSunrisePayToken();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ available: false, error: "method_not_allowed" }, 405);
  if (!PAY_TOKEN) return json({ available: false, error: "Brak konfiguracji Sunrise Pay" }, 503);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ available: false, error: "Brak autoryzacji" }, 401);

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount ?? 0);
    const requestId = String(body.idempotency_key || crypto.randomUUID());
    if (!Number.isFinite(amount) || amount <= 0) return json({ available: true, error: "Nieprawidłowa liczba punktów" }, 400);

    const response = await fetch(`${PAY_BASE}/pay-convert-points`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
      body: JSON.stringify({ user_ref: user.email, points: amount, idempotency_key: requestId }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && data?.ok) {
      return json({
        available: true,
        converted: Number(data.converted ?? 0),
        balance: Number(data.balance ?? 0),
        points: Number(data.points ?? 0),
      });
    }
    if (data?.error === "user_not_found") return json({ available: true, error: "Konto nie jest jeszcze połączone z MySunrise" }, 404);
    if (data?.error === "no_points") return json({ available: true, converted: 0, balance: Number(data.balance ?? 0), points: 0, error: "Brak punktów do zamiany" }, 400);
    return json({ available: true, error: data?.message ?? data?.error ?? `MySunrise ${response.status}` }, response.status >= 400 ? response.status : 502);
  } catch (error) {
    return json({ available: true, error: String((error as Error).message ?? error) }, 500);
  }
});
