// Wypłata sprzedawcy na żądanie: pomniejsza saldo lustra (wallet_mirror) i robi transfer Stripe.
// Atomowo: seller_wallet_withdraw debetuje lustro -> transfer Stripe -> settle; przy błędzie reverse (zwrot do lustra).
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
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user?.email) return json({ error: "Brak autoryzacji" }, 401);

    const body = await req.json().catch(() => ({}));
    const amount = body?.amount != null && Number.isFinite(Number(body.amount)) ? Number(body.amount) : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
    const { data: seller } = await admin.from("sellers").select("id, email, stripe_account_id, payouts_enabled").ilike("email", user.email).maybeSingle();
    if (!seller) return json({ error: "Nie znaleziono konta sprzedawcy" }, 403);

    // 1) atomowe pobranie z lustra + zlecenie
    const { data: wd, error: wErr } = await admin.rpc("seller_wallet_withdraw", { p_seller_id: seller.id, p_amount: amount });
    if (wErr) return json({ success: false, error: wErr.message }, 500);
    if (!wd?.ok) return json({ success: false, error: wd?.error ?? "withdraw_failed", balance: wd?.balance }, 400);

    // 2) transfer Stripe (idempotentny per zlecenie); przy błędzie -> reverse
    const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    try {
      const transfer = await stripe.transfers.create(
        { amount: Math.round(Number(wd.amount) * 100), currency: "pln", destination: String(wd.stripe_account_id), metadata: { withdrawal_id: String(wd.withdrawal_id) } },
        { idempotencyKey: `wd_${wd.withdrawal_id}` }
      );
      await admin.rpc("seller_withdrawal_settle", { p_id: wd.withdrawal_id, p_transfer: transfer.id });
      return json({ success: true, withdrawal_id: wd.withdrawal_id, amount: wd.amount, transfer_id: transfer.id, new_balance: wd.new_balance });
    } catch (e) {
      await admin.rpc("seller_withdrawal_reverse", { p_id: wd.withdrawal_id, p_reason: (e as Error).message });
      return json({ success: false, error: `Wypłata nieudana, środki zwrócone do salda: ${(e as Error).message}` }, 402);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
