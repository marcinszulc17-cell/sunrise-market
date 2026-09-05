// cj-admin — operator: lista draftow, status, aktywacja, statystyki (CJ + Eprolo + katalog). Provider-aware.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const PROVIDERS = ["cj", "eprolo", "teemdrop", "mysunrise"];
const prov = (v) => (PROVIDERS.includes(v) ? v : "cj");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "Tylko operator." }, 403);
  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const now = new Date().toISOString();
  if (action === "list") {
    const { data } = await admin.from("offers").select("id,title,price_gross,image_url,status,created_at").eq("fulfillment_provider", prov(body.provider)).eq("status", "draft").order("created_at", { ascending: false }).limit(300);
    return json({ items: data ?? [] });
  }
  if (action === "stats") {
    const { data, error } = await admin.rpc("cj_stats");
    if (error) return json({ error: error.message }, 400);
    return json({ items: data ?? [] });
  }
  if (action === "catalog_stats") {
    const { data, error } = await admin.rpc("catalog_stats", {
      p_provider: body.provider ?? null,
      p_search: body.search ? String(body.search).slice(0, 80) : null,
      p_sort: ["sold","views","margin","marginPct","price","revenue"].includes(body.sort) ? body.sort : "sold",
      p_limit: Math.min(Number(body.limit ?? 200), 500),
      p_offset: Math.max(Number(body.offset ?? 0), 0),
    });
    if (error) return json({ error: error.message }, 400);
    return json({ items: data ?? [] });
  }
  if (action === "set") {
    const st = ["active", "draft", "blocked"].includes(body.status) ? body.status : null;
    if (!body.offer_id || !st) return json({ error: "bad args" }, 400);
    await admin.from("offers").update({ status: st, updated_at: now }).eq("id", body.offer_id);
    return json({ ok: true });
  }
  if (action === "activateAll") {
    const { data } = await admin.from("offers").update({ status: "active", updated_at: now }).eq("fulfillment_provider", prov(body.provider)).eq("status", "draft").select("id");
    return json({ ok: true, activated: (data ?? []).length });
  }
  return json({ error: "unknown action" }, 400);
});
