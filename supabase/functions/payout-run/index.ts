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
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if ((req.headers.get("X-Cron-Secret") ?? "") !== (Deno.env.get("CRON_SECRET") ?? "\u0000")) return json({ error: "Forbidden" }, 403);
    const { period_start, period_end, seller_id } = await req.json().catch(() => ({}));
    if (!period_start || !period_end) return json({ error: "Podaj period_start i period_end (YYYY-MM-DD)" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
    const stripe = new Stripe(await resolveStripeKey(), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    let q = sb.from("sellers").select("id, stripe_account_id, payouts_enabled").eq("payouts_enabled", true);
    if (seller_id) q = q.eq("id", seller_id);
    const { data: sellers, error: sErr } = await q;
    if (sErr) throw sErr;
    const results: unknown[] = [];
    for (const s of sellers ?? []) {
      const { data: runId, error: rErr } = await sb.rpc("generate_payout_run", { p_seller: s.id, p_start: period_start, p_end: period_end });
      if (rErr) { results.push({ seller: s.id, error: rErr.message }); continue; }
      const { data: run } = await sb.from("payout_runs").select("id, net_payout, status").eq("id", runId).single();
      if (!run || run.status === "paid" || Number(run.net_payout) <= 0) { results.push({ seller: s.id, run: runId, skipped: true, net: run?.net_payout }); continue; }
      await sb.from("payout_runs").update({ status: "processing" }).eq("id", run.id);
      try {
        const transfer = await stripe.transfers.create(
          { amount: Math.round(Number(run.net_payout) * 100), currency: "pln", destination: s.stripe_account_id!, metadata: { payout_run_id: run.id, seller_id: s.id } },
          { idempotencyKey: `payout_${run.id}` });
        await sb.rpc("mark_payout_paid", { p_run: run.id, p_transfer: transfer.id });
        results.push({ seller: s.id, run: run.id, transfer: transfer.id, net: run.net_payout });
      } catch (e) {
        await sb.from("payout_runs").update({ status: "failed", failure_reason: String((e as Error).message) }).eq("id", run.id);
        results.push({ seller: s.id, run: run.id, error: String((e as Error).message) });
      }
    }
    return json({ period_start, period_end, count: results.length, results });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
});
