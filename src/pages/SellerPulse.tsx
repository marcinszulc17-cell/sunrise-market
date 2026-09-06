// Centrum sprzedaży → Puls (decyzja właściciela 2026-09-06): wyświetlenia / ulubione / zapytania per ogłoszenie z wykresem 14 dni,
// podpowiedź ceny liczona z danych kategorii (mediana ceny i wyświetleń — bez obietnic), jedno kliknięcie „Promuj” (promote-offer).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { promoteOffer } from "../lib/api";
import { zl } from "../lib/money";

type Day = { day: string; views: number; favorites: number; leads: number; messages: number };
type OfferRow = { offer_id: string; title: string; image_url: string | null; price_gross: number; status: string; category: string; views7: number; views_prev7: number; favorites: number; leads: number; promoted_until: string | null; photos: number; description_len: number; category_median_price: number | null; category_median_views7: number | null };
type Pulse = { days: number; totals: Record<string, number>; prev_totals: Record<string, number>; sales: { count: number; gross: number }; series: Day[]; offers: OfferRow[] };

const CARD = { background: "var(--glass)", border: "1px solid var(--line)" } as const;

/** Podpowiedzi z danych — tylko to, co wynika z liczb, żadnych obietnic. */
function hints(o: OfferRow): { text: string; kind: "price" | "photos" | "desc" | "trend" | "ok" }[] {
  const out: { text: string; kind: "price" | "photos" | "desc" | "trend" | "ok" }[] = [];
  const med = Number(o.category_median_price || 0), medV = Number(o.category_median_views7 || 0);
  if (med > 0 && o.price_gross > med * 1.12) {
    const pct = Math.round((o.price_gross / med - 1) * 100);
    out.push({ kind: "price", text: `Cena jest ${pct}% powyżej mediany kategorii (${zl(med)})${medV > 0 && o.views7 < medV ? ` i ogłoszenie ma mniej wyświetleń niż typowe w tej kategorii (${o.views7} vs ${Math.round(medV)})` : ""}. Obniżka o 5% dałaby ${zl(Math.round(o.price_gross * 0.95))}.` });
  } else if (med > 0 && o.price_gross < med * 0.8 && o.views7 >= medV) {
    out.push({ kind: "price", text: `Cena jest ${Math.round((1 - o.price_gross / med) * 100)}% poniżej mediany kategorii (${zl(med)}) przy dobrym zainteresowaniu — jest miejsce na wyższą cenę.` });
  }
  if (o.photos < 3) out.push({ kind: "photos", text: o.photos === 0 ? "Brak zdjęć — ogłoszenia ze zdjęciami dostają zdecydowanie więcej wyświetleń." : `Tylko ${o.photos} ${o.photos === 1 ? "zdjęcie" : "zdjęcia"} — dodaj kilka z różnych stron.` });
  if (o.description_len < 200) out.push({ kind: "desc", text: "Krótki opis — dopisz stan, wyposażenie i warunki (asystent Suri napisze go ze zdjęć)." });
  if (o.views_prev7 > 0 && o.views7 < o.views_prev7 * 0.6) out.push({ kind: "trend", text: `Wyświetlenia spadły o ${Math.round((1 - o.views7 / o.views_prev7) * 100)}% wobec poprzedniego tygodnia — odśwież zdjęcie główne albo promuj.` });
  if (!out.length) out.push({ kind: "ok", text: "Wygląda dobrze — cena w normie dla kategorii, zdjęcia i opis są." });
  return out;
}

function Spark({ series, k }: { series: Day[]; k: keyof Day }) {
  const vals = series.map((d) => Number(d[k]) || 0); const max = Math.max(1, ...vals);
  const w = 100, h = 36, step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true"><polyline points={pts} fill="none" stroke="#F5A623" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <span className="text-xs" style={{ color: "var(--mut)" }}>—</span>;
  if (!prev) return <span className="text-xs" style={{ color: "#7AB89A" }}>nowe</span>;
  const d = Math.round(((now - prev) / prev) * 100);
  return <span className="text-xs font-semibold" style={{ color: d >= 0 ? "#7AB89A" : "#f87171" }}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}%</span>;
}

export default function SellerPulse() {
  const [data, setData] = useState<Pulse | null | undefined>(undefined);
  const [days, setDays] = useState(14);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function load(d = days) { const { data: p, error } = await supabase.rpc("seller_pulse", { p_days: d }); if (error) { setMsg(error.message); setData(null); return; } setData((p as Pulse) || null); }
  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function promote(id: string) {
    setBusy(id); setMsg(null);
    try { const cost = await promoteOffer(id, 7); setMsg(`Wyróżniono na 7 dni za ${cost} zł.`); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }
  const t = data?.totals || {}, p = data?.prev_totals || {};
  const bars = useMemo(() => data?.series || [], [data]);
  const max = Math.max(1, ...bars.map((d) => d.views));

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><Link to="/sprzedawca/partner/pulpit" className="text-sm" style={{ color: "var(--mut)" }}>← Panel sprzedawcy</Link><h1 className="mt-2 font-display text-3xl font-semibold">Puls ogłoszeń</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Co się dzieje z Twoimi ogłoszeniami — i co z tego wynika.</p></div>
      <div className="flex gap-1 rounded-xl p-1" style={CARD}>{[7, 14, 30].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={days === d ? { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" } : {}}>{d} dni</button>)}</div>
    </div>
    {msg && <div className="mb-4 rounded-xl px-4 py-2 text-sm" style={{ background: "rgba(232,137,26,.12)", color: "var(--gold)" }}>{msg}</div>}
    {data === undefined && <div className="rounded-2xl p-6 text-sm" style={CARD}>Liczę…</div>}
    {data === null && <div className="rounded-2xl p-6 text-sm" style={CARD}>Brak danych — zaloguj się jako sprzedawca.</div>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([["views", "Wyświetlenia", "👁"], ["favorites", "Do ulubionych", "♡"], ["leads", "Zapytania", "📩"], ["messages", "Wiadomości", "💬"]] as const).map(([k, label, ico]) => <div key={k} className="rounded-2xl p-4" style={CARD}>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--mut)" }}><span>{ico} {label}</span><Delta now={Number(t[k] || 0)} prev={Number(p[k] || 0)} /></div>
          <div className="mt-1 text-2xl font-bold">{Number(t[k] || 0).toLocaleString("pl-PL")}</div>
          <Spark series={bars} k={k} />
        </div>)}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl p-4" style={CARD}><div className="text-xs" style={{ color: "var(--mut)" }}>Opłacone sprzedaże ({data.days} dni)</div><div className="mt-1 text-2xl font-bold">{data.sales.count} <span className="text-sm font-normal" style={{ color: "var(--mut)" }}>· {zl(Number(data.sales.gross || 0))}</span></div></div>
        <div className="rounded-2xl p-4" style={CARD}><div className="text-xs" style={{ color: "var(--mut)" }}>Konwersja: zapytania / 100 wyświetleń</div><div className="mt-1 text-2xl font-bold">{Number(t.views) ? ((Number(t.leads || 0) + Number(t.messages || 0)) / Number(t.views) * 100).toFixed(1) : "—"}</div></div>
      </div>

      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={CARD}>
        <h2 className="text-lg font-bold">Wyświetlenia dzień po dniu</h2>
        <div className="mt-3 flex h-40 items-end gap-1">{bars.map((d) => <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${new Date(d.day).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}: ${d.views} wyświetleń, ${d.favorites} ♡, ${d.leads + d.messages} zapytań`}>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(2, (d.views / max) * 100)}%`, background: "linear-gradient(180deg,#F5A623,#E8891A)" }} />
        </div>)}</div>
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--mut)" }}><span>{bars[0] && new Date(bars[0].day).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span><span>dziś</span></div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Ogłoszenia</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Podpowiedzi liczymy z Twoich danych i mediany kategorii — bez obietnic.</p>
        <div className="mt-3 grid gap-3">{data.offers.length === 0 && <div className="rounded-2xl p-5 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak aktywnych ogłoszeń. <Link to="/sprzedawca/wystaw" className="underline" style={{ color: "var(--gold)" }}>Wystaw pierwsze.</Link></div>}
          {data.offers.map((o) => { const hs = hints(o); const promoted = o.promoted_until && new Date(o.promoted_until) > new Date(); return <div key={o.offer_id} className="rounded-2xl p-4" style={CARD}>
            <div className="flex gap-3">
              <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--header)" }}>{o.image_url && <img src={o.image_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2"><Link to={`/produkt/${o.offer_id}`} className="line-clamp-2 font-semibold leading-5">{o.title}</Link><span className="shrink-0 font-bold" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</span></div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--mut)" }}><span>👁 {o.views7} <Delta now={o.views7} prev={o.views_prev7} /></span><span>♡ {o.favorites}</span><span>📩 {o.leads}</span><span>{o.category}</span>{o.status === "paused" && <span style={{ color: "var(--gold)" }}>wstrzymane</span>}{promoted && <span style={{ color: "#7AB89A" }}>✨ promowane do {new Date(o.promoted_until!).toLocaleDateString("pl-PL")}</span>}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">{hs.map((h, i) => <li key={i} className="rounded-xl px-3 py-2 text-sm" style={{ background: h.kind === "ok" ? "rgba(122,184,154,.10)" : "rgba(245,166,35,.08)", border: `1px solid ${h.kind === "ok" ? "rgba(122,184,154,.35)" : "rgba(245,166,35,.3)"}` }}>{h.kind === "price" ? "💰" : h.kind === "photos" ? "📷" : h.kind === "desc" ? "📝" : h.kind === "trend" ? "📉" : "✅"} {h.text}</li>)}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/sprzedawca/oferty/${o.offer_id}/edytuj`} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Edytuj</Link>
              {!promoted && <button type="button" disabled={busy === o.offer_id} onClick={() => promote(o.offer_id)} className="rounded-xl px-3 py-2 text-sm font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{busy === o.offer_id ? "…" : "✨ Promuj 7 dni"}</button>}
            </div>
          </div>; })}
        </div>
      </section>
    </>}
  </div></main>;
}
