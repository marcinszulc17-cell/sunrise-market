// „Napisz do sprzedawcy” na stronie oferty (decyzja właściciela 2026-09-06). Okno z treścią → RPC start_conversation
// → przejście do /wiadomosci?w=<id>. Gość trafia do logowania z powrotem na ofertę. Nie zastępuje „Zapytaj sprzedawcę” (lead z telefonem).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { startConversation } from "../lib/api";
import { Ico, GOLD_GRAD, CARD } from "./home/HomeShared";

export default function MessageSellerButton({ offerId, title, className, style, variant = "secondary" }: { offerId: string; title: string; className?: string; style?: React.CSSProperties; variant?: "primary" | "secondary" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function start() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setOpen(true); setErr(null);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (text.trim().length < 2) return; setBusy(true); setErr(null);
    try { const id = await startConversation(offerId, text.trim()); setOpen(false); navigate(`/wiadomosci?w=${id}`); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  const base = variant === "primary" ? { background: GOLD_GRAD, color: "#101012" } : { ...CARD };
  return <>
    <button type="button" onClick={start} className={className ?? "flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold"} style={{ ...base, ...style }}><Ico name="mail" size={18} />Napisz do sprzedawcy</button>
    {open && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} role="dialog" aria-modal="true" aria-label="Napisz do sprzedawcy">
      <form onSubmit={send} className="w-full max-w-lg rounded-2xl p-5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
        <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-semibold tracking-[.2em]" style={{ color: "var(--gold)" }}>WIADOMOŚĆ</div><h2 className="mt-1 text-xl font-bold">Napisz do sprzedawcy</h2><p className="mt-1 line-clamp-1 text-sm" style={{ color: "var(--mut)" }}>{title}</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-xl" style={{ color: "var(--mut)" }} aria-label="Zamknij">×</button></div>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} placeholder="Dzień dobry, czy oferta jest aktualna? …" className="mt-4 w-full rounded-xl px-3 py-3 text-sm outline-none" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--ink)" }} />
        <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Rozmowa zostanie zapisana w Twoich Wiadomościach; sprzedawca dostanie powiadomienie. Płać zawsze przez Sunrise — Ochrona Kupujących działa tylko wtedy.</p>
        {err && <div className="mt-2 text-sm" style={{ color: "#f87171" }}>{err}</div>}
        <div className="mt-4 flex gap-2"><button type="submit" disabled={busy || text.trim().length < 2} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: GOLD_GRAD, color: "#101012" }}><Ico name="send" size={16} />{busy ? "Wysyłam…" : "Wyślij"}</button><button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm" style={CARD}>Anuluj</button></div>
      </form>
    </div>}
  </>;
}
