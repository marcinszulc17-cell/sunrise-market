// mkt-sms — SMS transakcyjny na zlecenie Sunrise Market (np. kod potwierdzenia wydania/zwrotu przy wynajmie).
// Auth: X-Sunrise-Service-Token (pay_config.service_token) — ten sam mechanizm co pay-charge / pay-credit-points.
// Deleguje do send-sms (SMSAPI) z kluczem serwisowym huba; skipOptInCheck=true (SMS transakcyjny, nie marketing).
// Wejście: { phone, body, trigger?, testMode? }  → wyjście: odpowiedź send-sms ({ success, messageId, parts } | { error }).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunrise-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPA = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPA, SERVICE);

  const { data: cfg } = await admin.from("pay_config").select("service_token").eq("id", true).maybeSingle();
  if (!cfg?.service_token) return json({ ok: false, error: "service_not_configured" }, 503);
  const supplied = req.headers.get("x-sunrise-service-token") ?? "";
  if (!supplied || supplied !== cfg.service_token) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const phone = String(body.phone ?? "").trim();
  const text = String(body.body ?? "").trim().slice(0, 320);
  const trigger = String(body.trigger ?? "market").replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "market";
  if (!phone || !text) return json({ ok: false, error: "phone_and_body_required" }, 422);

  const res = await fetch(`${SUPA}/functions/v1/send-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({ phone, body: text, trigger: `market_${trigger}`, skipOptInCheck: true, ...(body.testMode === true ? { testMode: true } : {}) }),
  });
  const out = await res.json().catch(() => ({}));
  return json({ ok: res.ok && out?.success === true, ...out }, res.ok ? 200 : res.status);
});
