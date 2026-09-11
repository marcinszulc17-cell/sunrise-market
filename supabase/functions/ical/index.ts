// ical — pobieranie kalendarzy zewnętrznych (Booking, Airbnb, Nocowanie…) i zapisywanie
// zajętych terminów jako blokad w market.booking_blocks.
//
// Eksport NASZEGO kalendarza nie jest tutaj — robi go /api/ical na sunrisemarket.pl,
// bo portale pobierają plik anonimowo, a funkcje brzegowe wymagają klucza.
//
// POST { offer_id }  — z tokenem sprzedawcy: odśwież kalendarze jednej jego oferty
// POST { all: true } — z X-Sunrise-Service-Token: odśwież wszystkie (cron co 30 min)
//
// Blokada, której nie ma już w źródle, jest kasowana — zwolniony termin ma wrócić
// do sprzedaży. Import nigdy nie dotyka blokad ustawionych ręcznie.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunrise-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const svc = () => createClient(URL_, SERVICE_KEY, { db: { schema: "market" } });

async function serviceToken(): Promise<string> {
  const env = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (env) return env;
  try {
    const r = await fetch(`${URL_}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Accept-Profile": "market" },
    });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}

type Ev = { uid: string; start: Date; end: Date; summary: string };

// RFC 5545 pozwala łamać długie linie: kontynuacja zaczyna się spacją lub tabem.
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

// DTSTART;VALUE=DATE:20260712 | DTSTART:20260712T140000Z | DTSTART;TZID=Europe/Warsaw:20260712T140000
function parseDt(value: string, params: string): Date | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const isDate = /VALUE=DATE(?!-TIME)/i.test(params) || !h;
  if (isDate || z) return new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0)));
  // Czas lokalny bez strefy. Portale noclegowe operują dobami, więc godzina i tak
  // nie zmienia tego, który dzień jest zajęty — przyjmujemy czas polski.
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 2, +mi, +s));
}

function parseIcs(text: string): Ev[] {
  const events: Ev[] = [];
  let cur: (Partial<Ev> & { cancelled?: boolean }) | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur?.start && cur.end && !cur.cancelled && cur.end > cur.start) {
        events.push({ uid: cur.uid || `${+cur.start}-${+cur.end}`, start: cur.start, end: cur.end, summary: cur.summary ?? "" });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = left.split(";")[0].toUpperCase();
    const params = left.slice(name.length);
    if (name === "UID") cur.uid = value.trim().slice(0, 300);
    else if (name === "SUMMARY") cur.summary = value.trim().slice(0, 200);
    else if (name === "STATUS" && /CANCELLED/i.test(value)) cur.cancelled = true;
    else if (name === "DTSTART") cur.start = parseDt(value, params) ?? undefined;
    else if (name === "DTEND") cur.end = parseDt(value, params) ?? undefined;
  }
  return events;
}

async function syncFeed(db: ReturnType<typeof svc>, feed: any): Promise<{ ok: boolean; events: number; error?: string }> {
  let text = "";
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "SunriseMarket/1.0 (+https://sunrisemarket.pl)", Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Odpowiedź nie jest kalendarzem iCal");
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    await db.from("booking_ical_feeds").update({ last_sync_at: new Date().toISOString(), last_status: "error", last_error: msg }).eq("id", feed.id);
    return { ok: false, events: 0, error: msg };
  }

  const events = parseIcs(text).filter((e) => e.end.getTime() > Date.now() - 30 * 86400000);
  const keep: string[] = [];
  for (const ev of events) {
    const uid = ev.uid.slice(0, 300);
    keep.push(uid);
    await db.from("booking_blocks").upsert({
      offer_id: feed.offer_id,
      seller_id: feed.seller_id,
      starts_at: ev.start.toISOString(),
      ends_at: ev.end.toISOString(),
      reason: (feed.label || "Kalendarz zewnętrzny") + (ev.summary ? ` — ${ev.summary}` : ""),
      source: "ical",
      feed_id: feed.id,
      external_uid: uid,
    }, { onConflict: "feed_id,external_uid" });
  }

  const { data: existing } = await db.from("booking_blocks").select("id, external_uid").eq("feed_id", feed.id);
  const stale = (existing ?? []).filter((b: any) => !keep.includes(b.external_uid)).map((b: any) => b.id);
  if (stale.length) await db.from("booking_blocks").delete().in("id", stale);

  await db.from("booking_ical_feeds").update({
    last_sync_at: new Date().toISOString(), last_status: "ok", last_error: null, last_event_count: events.length,
  }).eq("id", feed.id);

  return { ok: true, events: events.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({} as any));
  const db = svc();

  if (body?.all === true) {
    const supplied = req.headers.get("x-sunrise-service-token") ?? "";
    const expected = await serviceToken();
    if (!expected || supplied !== expected) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: feeds } = await db.from("booking_ical_feeds").select("*").eq("active", true);
    let ok = 0, failed = 0, events = 0;
    for (const f of feeds ?? []) {
      const r = await syncFeed(db, f);
      if (r.ok) { ok++; events += r.events; } else failed++;
    }
    return json({ ok: true, feeds: (feeds ?? []).length, synced: ok, failed, events });
  }

  // Sprzedawca odświeża własną ofertę — listę kalendarzy czytamy JEGO tokenem,
  // więc RLS pilnuje, że nie ruszy cudzej oferty.
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, db: { schema: "market" } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  const offerId = String(body?.offer_id ?? "").trim();
  if (!offerId) return json({ ok: false, error: "offer_id_required" }, 400);

  const { data: mine, error: mineErr } = await userClient.from("booking_ical_feeds").select("*").eq("offer_id", offerId);
  if (mineErr) return json({ ok: false, error: "forbidden" }, 403);
  if (!mine?.length) return json({ ok: true, feeds: 0, synced: 0, failed: 0, events: 0 });

  let ok = 0, failed = 0, events = 0;
  const errors: string[] = [];
  for (const f of mine) {
    const r = await syncFeed(db, f);
    if (r.ok) { ok++; events += r.events; } else { failed++; if (r.error) errors.push(r.error); }
  }
  return json({ ok: true, feeds: mine.length, synced: ok, failed, events, errors });
});
