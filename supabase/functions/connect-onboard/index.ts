import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

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
const CONNECT_TYPE = (Deno.env.get("STRIPE_CONNECT_TYPE") ?? "express") as "express" | "standard";
const CONNECT_COUNTRY = Deno.env.get("STRIPE_CONNECT_COUNTRY") ?? "PL";
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Brak autoryzacji" }, 401);
    const { seller_id } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
    const { data: seller, error: sErr } = await sb.from("sellers").select("id, email, legal_name, stripe_account_id").eq("id", seller_id).single();
    if (sErr || !seller) return json({ error: "Nie znaleziono sprzedawcy" }, 404);
    if (seller.email !== user.email) return json({ error: "Brak uprawnien do tego konta" }, 403);
    const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    let accountId = seller.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: CONNECT_TYPE, country: CONNECT_COUNTRY, email: seller.email, business_type: "company",
        capabilities: { transfers: { requested: true } }, metadata: { seller_id: seller.id },
      });
      accountId = account.id;
      await sb.from("sellers").update({ stripe_account_id: accountId, connect_status: "onboarding" }).eq("id", seller.id);
    }
    const origin = Deno.env.get("PUBLIC_WEB_URL") ?? req.headers.get("origin") ?? "";
    const link = await stripe.accountLinks.create({
      account: accountId, refresh_url: `${origin}/sprzedawca/rozliczenia?connect=refresh`,
      return_url: `${origin}/sprzedawca/rozliczenia?connect=done`, type: "account_onboarding",
    });
    return json({ url: link.url, account_id: accountId });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
});
