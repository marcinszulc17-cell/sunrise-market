// Ocena zakupu wprost w Zamówieniach (kupujący, po opłaceniu/doręczeniu). Zapis przez add_review_simple —
// RPC sam sprawdza, że użytkownik naprawdę kupił ofertę. Jedna opinia na ofertę (ponowny zapis = edycja).
import { useState } from "react";
import { addReview } from "../lib/api";

export type MyReview = { offer_id: string; rating: number; comment: string | null; created_at: string; seller_reply?: string | null };

export default function ReviewInline({ offerId, title, existing, onSaved }: { offerId: string; title: string; existing?: MyReview; onSaved: (r: MyReview) => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    try { await addReview(offerId, rating, comment.trim()); onSaved({ offer_id: offerId, rating, comment: comment.trim() || null, created_at: new Date().toISOString() }); setDone(true); setOpen(false); }
    catch (e: any) { setErr(e?.message || "Nie udało się zapisać opinii."); }
    finally { setBusy(false); }
  }

  if (!open) {
    return <div className="flex flex-wrap items-center gap-2 text-xs">
      {existing
        ? <><span style={{ color: "var(--gold)" }}>{"★".repeat(existing.rating)}<span style={{ opacity: .25 }}>{"★".repeat(5 - existing.rating)}</span></span><span style={{ color: "var(--mut)" }}>Twoja ocena{done ? " — zapisana" : ""}</span><button type="button" onClick={() => setOpen(true)} className="underline" style={{ color: "var(--mut)" }}>Edytuj</button>{existing.seller_reply && <span style={{ color: "var(--mut)" }}>· sprzedawca odpowiedział</span>}</>
        : <button type="button" onClick={() => setOpen(true)} className="rounded-lg px-3 py-1 font-semibold" style={{ background: "rgba(232,200,150,.12)", color: "var(--gold)", border: "1px solid rgba(232,200,150,.3)" }}>⭐ Oceń zakup</button>}
    </div>;
  }
  return <div className="rounded-xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="text-xs" style={{ color: "var(--mut)" }}>Oceń: <b style={{ color: "var(--ink)" }}>{title}</b></div>
    <div className="mt-1 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-label={`${n} na 5`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="text-2xl leading-none" style={{ color: n <= (hover || rating) ? "var(--gold)" : "var(--line)" }}>★</button>)}
      <span className="ml-2 text-xs" style={{ color: "var(--mut)" }}>{["", "Słabo", "Tak sobie", "W porządku", "Dobrze", "Świetnie"][hover || rating]}</span>
    </div>
    <textarea rows={2} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Kilka słów o produkcie i sprzedawcy (opcjonalnie) — opinia będzie publiczna." className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} />
    {err && <div className="mt-1 text-xs" style={{ color: "#ef4444" }}>{err}</div>}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={save} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Zapisuję…" : existing ? "Zapisz zmiany" : "Opublikuj opinię"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm" style={{ color: "var(--mut)" }}>Anuluj</button>
      <span className="text-xs" style={{ color: "var(--mut)" }}>Publikujemy tylko opinie klientów po zakupie.</span>
    </div>
  </div>;
}
