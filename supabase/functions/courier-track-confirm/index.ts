import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const ENV = (Deno.env.get("GLOBKURIER_ENV") || "test").toLowerCase() === "prod" ? "prod" : "test";
const BASE = ENV === "prod" ? "https://api.globkurier.pl/v1" : "https://test.api.globkurier.pl/v1";
const GK_EMAIL = Deno.env.get("GLOBKURIER_EMAIL") || "";
const GK_PASSWORD = Deno.env.get("GLOBKURIER_PASSWORD") || "";

let cached: { token: string; at: number } | null = null;
async function gkToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 20 * 60_000) return cached.token;
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": "pl" },
    body: JSON.stringify({ email: GK_EMAIL, password: GK_PASSWORD }),
  });
  if (!r.ok) throw new Error(`GlobKurier auth ${r.status}`);
  const j = await r.json();
  const token = j?.token || j?.data?.token;
  if (!token) throw new Error("GlobKurier: brak tokenu");
  cached = { token, at: Date.now() };
  return token;
}

function hasDeliveredStatus(value: unknown): boolean {
  const delivered = ["delivered", "doręczono", "doreczono", "doręczona", "doreczona", "doręczone", "doreczone"];
  const walk = (x: unknown): boolean => {
    if (typeof x === "string") {
      const s = x.trim().toLowerCase();
      return delivered.some(v => s.includes(v));
    }
    if (Array.isArray(x)) return x.some(walk);
    if (x && typeof x === "object") return Object.values(x as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GK_EMAIL || !GK_PASSWORD) return json({ ok: false, error: "not_configured" }, 503);
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      db: { schema: "market" },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      db: { schema: "market" },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const taskId = String(body.task_id || "").trim();
    if (!taskId) return json({ ok: false, error: "missing_task" }, 400);

    const { data: task, error: taskErr } = await service
      .from("fulfillment_tasks")
      .select("id,order_id,tracking_no,status")
      .eq("id", taskId)
      .maybeSingle();
    if (taskErr || !task) return json({ ok: false, error: "task_not_found" }, 404);

    const { data: order } = await service.from("orders").select("buyer_id").eq("id", task.order_id).maybeSingle();
    if (!order || order.buyer_id !== userData.user.id) return json({ ok: false, error: "forbidden" }, 403);
    if (task.status === "delivered") return json({ ok: true, delivered: true, already: true });
    if (task.status !== "shipped") return json({ ok: true, delivered: false, status: task.status });

    let tracking = task.tracking_no as string | null;
    if (!tracking) {
      const { data: shipment } = await service
        .from("shipments")
        .select("tracking_no,gk_number,gk_hash,carrier")
        .eq("order_id", task.order_id)
        .or("tracking_no.not.is.null,gk_number.not.is.null,gk_hash.not.is.null")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      tracking = shipment?.tracking_no || shipment?.gk_number || null;
      if (!tracking && !shipment?.gk_hash) return json({ ok: true, delivered: false, reason: "no_tracking" });
      const token = await gkToken();
      const qs = tracking ? `number=${encodeURIComponent(tracking)}` : `hash=${encodeURIComponent(shipment!.gk_hash)}`;
      const r = await fetch(`${BASE}/order?${qs}`, { headers: { "Accept-Language": "pl", "x-auth-token": token, Authorization: `Bearer ${token}` } });
      const text = await r.text();
      let gk: unknown; try { gk = JSON.parse(text); } catch { gk = text; }
      if (!r.ok) return json({ ok: false, error: "gk_track_failed", status: r.status }, 502);
      const delivered = hasDeliveredStatus(gk);
      if (delivered && tracking) await service.rpc("courier_mark_tracking_delivered", { p_tracking: tracking, p_carrier: shipment?.carrier ?? "GlobKurier" });
      return json({ ok: true, delivered, tracking, carrier: shipment?.carrier ?? "GlobKurier" });
    }

    const token = await gkToken();
    const r = await fetch(`${BASE}/order?number=${encodeURIComponent(tracking)}`, { headers: { "Accept-Language": "pl", "x-auth-token": token, Authorization: `Bearer ${token}` } });
    const text = await r.text();
    let gk: unknown; try { gk = JSON.parse(text); } catch { gk = text; }
    if (!r.ok) return json({ ok: false, error: "gk_track_failed", status: r.status }, 502);
    const delivered = hasDeliveredStatus(gk);
    if (delivered) await service.rpc("courier_mark_tracking_delivered", { p_tracking: tracking, p_carrier: "GlobKurier" });
    return json({ ok: true, delivered, tracking, carrier: "GlobKurier" });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
