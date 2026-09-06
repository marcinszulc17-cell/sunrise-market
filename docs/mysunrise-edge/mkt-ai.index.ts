// mkt-ai — „mózg” Suri dla Sunrise Market (decyzja właściciela 2026-09-06: Suri jest mózgiem operacyjnym ekosystemu,
// a w Sunrise Market działa jej asystent). Sunrise Market nie ma własnego klucza AI — pyta hub MySunrise.
// Auth: X-Sunrise-Service-Token (pay_config.service_token) — jak pay-charge / mkt-sms.
// Wejście: { system?, messages: [{role, content}] (content: string | [{type:"text"|"image_url",...}]), json?: boolean, max_tokens?, temperature?, model? }
// Wyjście: { ok, text, usage } | { ok:false, error }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunrise-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("openai-suri") || Deno.env.get("openai_suri") || "";
const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]);

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
  if (!OPENAI_KEY) return json({ ok: false, error: "ai_not_configured" }, 503);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!messages.length) return json({ ok: false, error: "messages_required" }, 422);
  const model = ALLOWED_MODELS.has(String(body.model)) ? String(body.model) : "gpt-4o-mini";
  const max_tokens = Math.min(2000, Math.max(50, Number(body.max_tokens) || 600));
  const temperature = Math.min(1.2, Math.max(0, Number(body.temperature ?? 0.5)));
  const payload: Record<string, unknown> = {
    model, temperature, max_tokens,
    messages: [...(body.system ? [{ role: "system", content: String(body.system) }] : []), ...messages],
  };
  if (body.json === true) payload.response_format = { type: "json_object" };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) return json({ ok: false, error: d?.error?.message || `OpenAI HTTP ${r.status}` }, 502);
    return json({ ok: true, text: String(d?.choices?.[0]?.message?.content ?? ""), usage: d?.usage ?? null, model });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 502);
  }
});
