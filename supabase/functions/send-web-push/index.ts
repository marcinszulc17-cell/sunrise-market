// send-web-push — wysyła powiadomienia push (VAPID) dla nowych wpisów market.notifications (channel='app').
// Wołane przez cron `market-send-web-push` co minutę (bez JWT, jak verify-sweeper) albo ręcznie z { notification_id }.
// Klucze VAPID: env VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT albo market.internal_secrets (vapid_*).
// Subskrypcje z 404/410 (wygasłe) są usuwane; inne błędy zliczane w failures (po 5 — usunięcie).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
const APP_URL = (Deno.env.get("MARKET_APP_URL") ?? "https://app.sunrisemarket.pl").replace(/\/$/, "");

function linkFor(type: string): string {
  if (/order|delivery|dispute|refund|shipping/i.test(type)) return `${APP_URL}/zamowienia`;
  if (/seller_review/i.test(type)) return `${APP_URL}/sprzedawca/opinie`;
  if (/seller|settlement|payout|lead/i.test(type)) return `${APP_URL}/sprzedawca`;
  if (/booking|reservation/i.test(type)) return `${APP_URL}/rezerwacje`;
  if (/review_request/i.test(type)) return `${APP_URL}/zamowienia`;
  return `${APP_URL}/konto`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { db: { schema: "market" } });

  const { data: secrets } = await sb.from("internal_secrets").select("key,value").in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
  const s = Object.fromEntries((secrets ?? []).map((r: any) => [r.key, r.value]));
  const pub = Deno.env.get("VAPID_PUBLIC_KEY") || s.vapid_public_key; const priv = Deno.env.get("VAPID_PRIVATE_KEY") || s.vapid_private_key;
  const subject = Deno.env.get("VAPID_SUBJECT") || s.vapid_subject || "mailto:kontakt@sunrisemarket.pl";
  if (!pub || !priv) return json({ ok: false, error: "vapid_not_configured" }, 503);
  webpush.setVapidDetails(subject, pub, priv);

  const body = await req.json().catch(() => ({}));
  let q = sb.from("notifications").select("id,user_id,type,title,body,created_at").is("push_sent_at", null).eq("channel", "app").order("created_at").limit(200);
  if (typeof body?.notification_id === "string") q = sb.from("notifications").select("id,user_id,type,title,body,created_at").eq("id", body.notification_id).limit(1);
  const { data: pending, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!pending?.length) return json({ ok: true, sent: 0, pending: 0 });

  const userIds = Array.from(new Set(pending.map((n: any) => n.user_id)));
  const { data: subs } = await sb.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,failures").in("user_id", userIds);
  const byUser = new Map<string, any[]>();
  for (const sub of subs ?? []) { const arr = byUser.get(sub.user_id) ?? []; arr.push(sub); byUser.set(sub.user_id, arr); }

  let sent = 0, removed = 0, failed = 0;
  const stale = Date.now() - 24 * 3600 * 1000;
  for (const n of pending) {
    const targets = byUser.get(n.user_id) ?? [];
    const tooOld = new Date(n.created_at).getTime() < stale; // nie wysyłamy zaległych z >24 h
    if (targets.length && !tooOld) {
      const payload = JSON.stringify({ title: n.title || "Sunrise Market", body: n.body || "", url: linkFor(String(n.type || "")), tag: `sm-${n.type}`, id: n.id });
      for (const t of targets) {
        try {
          await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 3600, urgency: "normal" });
          sent++;
          if (t.failures > 0) await sb.from("push_subscriptions").update({ failures: 0, last_seen_at: new Date().toISOString() }).eq("id", t.id);
        } catch (e: any) {
          const code = Number(e?.statusCode ?? 0);
          if (code === 404 || code === 410 || t.failures + 1 >= 5) { await sb.from("push_subscriptions").delete().eq("id", t.id); removed++; }
          else { await sb.from("push_subscriptions").update({ failures: t.failures + 1 }).eq("id", t.id); failed++; }
        }
      }
    }
    await sb.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", n.id);
  }
  return json({ ok: true, pending: pending.length, sent, failed, removed });
});
