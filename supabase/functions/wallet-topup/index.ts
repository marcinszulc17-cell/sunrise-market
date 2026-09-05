import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Stripe przez npm: build esm.sh ciągnął polyfill std@0.177.1/node, który na obecnym runtime Supabase logował "Deno.core.runMicrotasks() is not supported".
import Stripe from "npm:stripe@16.12.0";

// Klucz Stripe: najpierw sekret środowiskowy, potem market.internal_secrets.
async function readInternalSecret(key: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? ""; const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.${key}`, { headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []); return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
// STRIPE_SECRET_KEY w env bywa błędny (2026-09-05: zawierał URL) — właściwy klucz jest w market.internal_secrets.
async function resolveStripeKey(): Promise<string> {
  const env = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (/^(sk|rk)_/.test(env)) return env;
  return await readInternalSecret("stripe_secret_key");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
// Limity doładowania: market.platform_config (topup_min_pln / topup_max_pln), fallback env, potem 10–25 000 zł.
async function topupLimits(sb: ReturnType<typeof createClient>): Promise<{ min: number; max: number }> {
  let min = Number(Deno.env.get("TOPUP_MIN_PLN") ?? "10"), max = Number(Deno.env.get("TOPUP_MAX_PLN") ?? "25000");
  try {
    const { data } = await sb.from("platform_config").select("key,value").in("key", ["topup_min_pln", "topup_max_pln"]);
    for (const r of (data ?? []) as { key: string; value: string }[]) { const v = Number(r.value); if (Number.isFinite(v) && v > 0) { if (r.key === "topup_min_pln") min = v; else max = v; } }
  } catch { /* fallback */ }
  return { min, max };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Brak autoryzacji" }, 401);
    if (!user.email) return json({ error: "Konto bez adresu e-mail" }, 400);

    const { amount, return_to } = await req.json();
    // Powrót po doładowaniu: koszyk przekazuje return_to (np. /koszyk?topup=success), żeby dokończyć zakup; tylko ścieżki względne.
    const backTo = typeof return_to === "string" && /^\/[^\/\\]/.test(return_to) ? return_to : "/portfel?topup=success";
    const amountGrosz = Math.round(Number(amount) * 100);
    const value = amountGrosz / 100;
    if (!SERVICE_KEY) return json({ error: "Brak konfiguracji usługi" }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { db: { schema: "market" } });
    const { min: MIN, max: MAX } = await topupLimits(sb);
    if (!Number.isInteger(amountGrosz) || value < MIN || value > MAX) {
      return json({ error: `Jednorazowe doładowanie portfela: od ${MIN} zł do ${MAX.toLocaleString("pl-PL")} zł. Większe zakupy opłać kartą bezpośrednio w koszyku.`, code: "topup_out_of_range", min: MIN, max: MAX }, 400);
    }

    const { data: topup, error: topupError } = await sb.from("wallet_topups")
      .insert({ user_id: user.id, amount: value, currency: "pln", status: "pending" })
      .select("id").single();
    if (topupError) throw topupError;

    const stripe = new Stripe(await resolveStripeKey(), {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const origin = Deno.env.get("PUBLIC_WEB_URL") ?? req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "p24", "blik"],
      currency: "pln",
      line_items: [{
        price_data: {
          currency: "pln",
          product_data: { name: "Doładowanie portfela Sunrise Pay" },
          unit_amount: amountGrosz,
        },
        quantity: 1,
      }],
      metadata: { topup_id: topup.id, user_id: user.id, user_email: user.email },
      customer_email: user.email,
      success_url: `${origin}${backTo}`,
      cancel_url: `${origin}/portfel?topup=cancel`,
    });
    const { error: sessionError } = await sb.from("wallet_topups")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", topup.id);
    if (sessionError) throw sessionError;

    return json({ url: session.url, session_id: session.id, topup_id: topup.id });
  } catch (error) {
    return json({ error: String((error as Error).message ?? error) }, 400);
  }
});
