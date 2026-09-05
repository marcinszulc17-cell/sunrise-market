import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL"); const ANON = Deno.env.get("SUPABASE_ANON_KEY"); const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(URL, ANON, { db: { schema: "market" }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isOp } = await userClient.rpc("ami_operator");
  if (isOp !== true) return json({ error: "op only" }, 403);
  const admin = createClient(URL, SVC, { db: { schema: "market" } });
  const body = await req.json().catch(() => ({}));
  const pid = body.pid;
  const { data: rows } = await admin.from("platform_config").select("key,value").in("key", ["cj_access_token"]);
  const token = (rows ?? []).find((r) => r.key === "cj_access_token")?.value;
  // proba z features=enable_video
  const r = await fetch(`${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}&features=enable_video`, { headers: { "CJ-Access-Token": token } });
  const j = await r.json().catch(() => null);
  const d = j?.data;
  return json({ pid, httpStatus: r.status, productVideo: d?.productVideo ?? null, productVideoType: Array.isArray(d?.productVideo) ? `array(${d.productVideo.length})` : typeof d?.productVideo });
});
