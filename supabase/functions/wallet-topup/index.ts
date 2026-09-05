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
const MIN = Number(Deno.env.get("TOPUP_MIN_PLN") ?? "10");
const MAX = Number(Deno.env.get("TOPUP_MAX_PLN") ?? "5000");

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

    const { amount } = await req.json();
    const amountGrosz = Math.round(Number(amount) * 100);
    const value = amountGrosz / 100;
    if (!Number.isInteger(amountGrosz) || value < MIN || value > MAX) {
      return json({ error: `Kwota poza zakresem ${MIN}-${MAX} zł` }, 400);
    }
    if (!SERVICE_KEY) return json({ error: "Brak konfiguracji usługi" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { db: { schema: "market" } });
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
      success_url: `${origin}/portfel?topup=success`,
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
