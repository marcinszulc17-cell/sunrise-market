// Centrum sprzedaży → Opinie: sprzedawca widzi opinie kupujących o swojej sprzedaży i może publicznie
// odpowiedzieć (reply_review). Opinii nie da się edytować ani usunąć — pochodzą tylko z opłaconych zamówień.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Stars } from "./SellerProfile";

type Review = { id: string; rating: number; comment: string | null; created_at: string; author: string; offer_id: string; offer_title: string | null; seller_reply: string | null; seller_replied_at: string | null };

function dateLabel(s: string) { try { return new Date(s).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } }

export default function SellerReviews() {
  const [rows, setRows] = useState<Review[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}); const [busy, setBusy] = useState<string | null>(null); const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.schema("market").rpc("my_seller_reviews");
    if (error) { setErr(error.message); setRows([]); } else setRows((data || []) as Review[]);
    const { data: me } = await supabase.rpc("my_seller");
    setSellerId((Array.isArray(me) ? me[0]?.id : (me as any)?.id) || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function reply(id: string, text: string) {
    setBusy(id); setErr(null);
    const { error } = await supabase.schema("market").rpc("reply_review", { p_review: id, p_text: text });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    setRows(r => r.map(x => x.id === id ? { ...x, seller_reply: text.trim() || null, seller_replied_at: text.trim() ? new Date().toISOString() : null } : x));
    setOpen(null);
  }

  const avg = useMemo(() => rows.length ? rows.reduce((a, r) => a + Number(r.rating), 0) / rows.length : 0, [rows]);
  const unanswered = rows.filter(r => !r.seller_reply).length;

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Centrum sprzedaży</div><h1 className="text-2xl font-semibold">Opinie o mojej sprzedaży</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Opinie mogą wystawiać tylko klienci z opłaconym zamówieniem. Możesz odpowiedzieć publicznie na każdą z nich.</p></div>
      <div className="flex gap-2"><Link to="/sprzedawca" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>← Panel</Link>{sellerId && <Link to={`/sprzedawcy/${sellerId}`} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#0E1729" }}>Mój publiczny profil</Link>}</div>
    </div>

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <Kpi label="Średnia ocena" value={rows.length ? `${avg.toFixed(1)} / 5` : "—"} />
      <Kpi label="Liczba opinii" value={String(rows.length)} />
      <Kpi label="Bez odpowiedzi" value={String(unanswered)} />
    </div>

    {err && <div className="mb-4 rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>{err}</div>}
    {loading ? <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Wczytuję opinie…</div>
    : rows.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">Nie masz jeszcze opinii</div><p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>Po doręczeniu zamówienia klient dostaje prośbę o ocenę zakupu. Opinie pojawią się tutaj i na Twoim publicznym profilu. Szybka wysyłka i dobry kontakt to najprostsza droga do odznaki „Zaufany” (10 opinii, średnia 4,5+).</p></div>
    : <div className="grid gap-3">{rows.map(r => <article key={r.id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Stars value={r.rating} /><div className="mt-1 text-sm"><span className="font-semibold">{r.author}</span><span style={{ color: "var(--mut)" }}> · {dateLabel(r.created_at)}</span></div></div>{r.offer_title && <Link to={`/produkt/${r.offer_id}`} className="text-xs" style={{ color: "var(--gold)" }}>{r.offer_title}</Link>}</div>
        {r.comment ? <p className="mt-3 text-sm leading-6">{r.comment}</p> : <p className="mt-3 text-sm italic" style={{ color: "var(--mut)" }}>Ocena bez komentarza</p>}
        {r.seller_reply && open !== r.id && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="flex items-center justify-between"><span className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Twoja odpowiedź{r.seller_replied_at ? ` · ${dateLabel(r.seller_replied_at)}` : ""}</span><button type="button" className="text-xs" style={{ color: "var(--mut)" }} onClick={() => { setDraft(d => ({ ...d, [r.id]: r.seller_reply || "" })); setOpen(r.id); }}>Edytuj</button></div><p className="mt-1 leading-6" style={{ color: "var(--mut)" }}>{r.seller_reply}</p></div>}
        {open === r.id ? <div className="mt-3">
          <textarea value={draft[r.id] ?? ""} onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))} maxLength={1000} rows={3} placeholder="Podziękuj za zakup, odnieś się do uwag — odpowiedź będzie widoczna publicznie." className="w-full rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} />
          <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={busy === r.id} onClick={() => reply(r.id, draft[r.id] ?? "")} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#0E1729", opacity: busy === r.id ? .6 : 1 }}>{busy === r.id ? "Zapisuję…" : "Opublikuj odpowiedź"}</button><button type="button" onClick={() => setOpen(null)} className="rounded-xl px-4 py-2 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Anuluj</button>{r.seller_reply && <button type="button" disabled={busy === r.id} onClick={() => reply(r.id, "")} className="text-xs" style={{ color: "var(--mut)" }}>Usuń odpowiedź</button>}<span className="ml-auto text-xs" style={{ color: "var(--mut)" }}>{(draft[r.id] ?? "").length}/1000</span></div>
        </div> : !r.seller_reply && <button type="button" onClick={() => setOpen(r.id)} className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Odpowiedz publicznie</button>}
      </article>)}</div>}
  </div></main>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}
