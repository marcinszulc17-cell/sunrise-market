import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

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

function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function hasDeliveredStatus(value: unknown): boolean {
  const delivered = new Set([
    "delivered",
    "doreczono",
    "doreczona",
    "doreczone",
    "przesylka doreczona",
    "paczka doreczona",
  ]);
  const statusKeys = new Set(["status", "state", "trackingstatus", "tracking_status", "shipmentstatus", "shipment_status", "orderstatus", "order_status"]);

  const walk = (x: unknown, key?: string): boolean => {
    if (typeof x === "string") {
      if (key && !statusKeys.has(key.toLowerCase())) return false;
      return delivered.has(normalizeStatus(x));
    }
    if (Array.isArray(x)) return x.some(item => walk(item));
    if (x && typeof x === "object") {
      return Object.entries(x as Record<string, unknown>).some(([k, v]) => walk(v, k));
    }
    return false;
  };
  return walk(value);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!GK_EMAIL || !GK_PASSWORD) return json({ ok: false, error: "not_configured" }, 503);

    const secret = req.headers.get("x-cron-secret") || "";
    if (!secret) return json({ ok: false, error: "unauthorized" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "market" } },
    );

    const { data: secretOk, error: secretErr } = await service.rpc("verify_courier_tracking_cron_secret", { p_secret: secret });
    if (secretErr || secretOk !== true) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: candidates, error: candidateErr } = await service.rpc("courier_tracking_poll_candidates", { p_limit: 50 });
    if (candidateErr) throw candidateErr;

    const rows = Array.isArray(candidates) ? candidates : [];
    if (!rows.length) return json({ ok: true, checked: 0, delivered: 0, failed: 0 });

    const token = await gkToken();
    let checked = 0;
    let delivered = 0;
    let failed = 0;

    for (const s of rows) {
      const number = String(s.tracking_no || s.gk_number || "").trim();
      const hash = String(s.gk_hash || "").trim();
      const qs = number ? `number=${encodeURIComponent(number)}` : hash ? `hash=${encodeURIComponent(hash)}` : "";
      if (!qs) continue;

      try {
        const r = await fetch(`${BASE}/order?${qs}`, {
          headers: {
            "Accept-Language": "pl",
            "x-auth-token": token,
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await r.text();
        let gk: unknown;
        try { gk = JSON.parse(text); } catch { gk = text; }

        checked += 1;
        if (!r.ok) {
          failed += 1;
          await service.rpc("courier_tracking_record_check", { p_shipment: s.shipment_id, p_error: `GlobKurier ${r.status}` });
          continue;
        }

        if (hasDeliveredStatus(gk)) {
          const { error: markErr } = await service.rpc("courier_mark_shipment_delivered", {
            p_shipment: s.shipment_id,
            p_carrier: s.carrier || "GlobKurier",
          });
          if (markErr) throw markErr;
          delivered += 1;
        } else {
          await service.rpc("courier_tracking_record_check", { p_shipment: s.shipment_id, p_error: null });
        }
      } catch (e) {
        failed += 1;
        const message = String((e as Error)?.message || e);
        await service.rpc("courier_tracking_record_check", { p_shipment: s.shipment_id, p_error: message }).catch(() => null);
      }
    }

    return json({ ok: true, checked, delivered, failed });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
