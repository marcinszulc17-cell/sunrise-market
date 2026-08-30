import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
const PAY_TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function uuidv5(name: string): Promise<string> {
  const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const nsBytes = (NS.replace(/-/g, "").match(/.{2}/g) as string[]).map((h) => parseInt(h, 16));
  const nameBytes = Array.from(new TextEncoder().encode(name));
  const data = new Uint8Array([...nsBytes, ...nameBytes]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function pay(path: string, body: unknown) {
  if (!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const r = await fetch(`${PAY_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": PAY_TOKEN },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SERVICE_KEY) return json({ ok: false, error: "service_key_missing" }, 500);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { db: { schema: "market" } });
  const provided = req.headers.get("x-retry-token") ?? "";
  const { data: secretRow, error: secretError } = await sb.from("internal_secrets").select("value").eq("key", "seller_settlement_retry_token").maybeSingle();
  if (secretError || !secretRow?.value || provided !== secretRow.value) return json({ ok: false, error: "unauthorized" }, 401);

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("seller_settlements")
    .select("id,order_id,seller_id,seller_email,amount,status,attempts,updated_at,available_at")
    .in("status", ["scheduled", "pending", "failed"])
    .or(`status.neq.scheduled,available_at.lte.${now}`)
    .lt("updated_at", cutoff)
    .lt("attempts", 8)
    .order("updated_at", { ascending: true })
    .limit(25);
  if (error) return json({ ok: false, error: error.message }, 500);

  let settled = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const attempts = Number(row.attempts ?? 0) + 1;
    const idem = await uuidv5(`market:seller:${row.order_id}:${row.seller_id}`);
    try {
      const credited = await pay("pay-credit", {
        user_ref: row.seller_email,
        amount_grosz: Math.round(Number(row.amount ?? 0) * 100),
        reason: "Sprzedaż Sunrise Market",
        order_ref: row.order_id,
        idempotency_key: idem,
      });
      const ok = credited.status === 200 && credited.data?.ok === true;
      await sb.from("seller_settlements").update({
        status: ok ? "settled" : "failed",
        attempts,
        mysunrise_tx_id: ok && credited.data?.tx_id ? String(credited.data.tx_id) : null,
        last_error: ok ? null : String(credited.data?.message ?? credited.data?.error ?? credited.status),
        settled_at: ok ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (ok && row.status === "scheduled") {
        await sb.from("bookings").update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("order_id", row.order_id).eq("status", "confirmed");
      }
      if (ok) settled++; else failed++;
    } catch (e) {
      await sb.from("seller_settlements").update({
        status: "failed",
        attempts,
        last_error: String((e as Error).message ?? e),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      failed++;
    }
  }

  return json({ ok: true, checked: (rows ?? []).length, settled, failed });
});
