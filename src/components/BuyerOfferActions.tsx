import { FormEvent, useEffect, useState } from "react";
import { toggleWatch, watchedIds } from "../lib/api";
import { supabase } from "../lib/supabase";

type Props = { offerId: string; allowViewing?: boolean };
const COMPARE_KEY = "sunrise_compare_ids";

export default function BuyerOfferActions({ offerId, allowViewing = false }: Props) {
  const [watched, setWatched] = useState(false);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    watchedIds().then(ids => setWatched(ids.includes(offerId))).catch(() => {});
    try { setCompare(JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]").includes(offerId)); } catch { /* ignore */ }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, [offerId]);

  async function watch() {
    setBusy(true); setStatus(null);
    try {
      const on = await toggleWatch(offerId);
      setWatched(on);
      if (on) {
        await supabase.rpc("set_watch_alert", { p_offer: offerId, p_enabled: true });
        setStatus("Obserwujesz ofertę. Powiadomimy Cię w aplikacji, gdy cena spadnie.");
      } else setStatus("Usunięto z obserwowanych.");
    } catch (e: any) {
      const msg = e?.message || "Nie udało się zmienić obserwowania.";
      if (msg.toLowerCase().includes("zaloguj")) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      else setStatus(msg);
    } finally { setBusy(false); }
  }

  function toggleCompare() {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]"); } catch { ids = []; }
    if (ids.includes(offerId)) ids = ids.filter(id => id !== offerId);
    else {
      if (ids.length >= 4) ids = ids.slice(1);
      ids.push(offerId);
    }
    localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
    setCompare(ids.includes(offerId));
    setStatus(ids.includes(offerId) ? `Dodano do porównania (${ids.length}/4).` : "Usunięto z porównania.");
  }

  async function submitViewing(e: FormEvent) {
    e.preventDefault(); setBusy(true); setStatus(null);
    const iso = when ? new Date(when).toISOString() : null;
    const { error } = await supabase.rpc("create_viewing_request", {
      p_offer: offerId,
      p_name: name,
      p_email: email || null,
      p_phone: phone || null,
      p_appointment_at: iso,
      p_message: message || null,
    });
    setBusy(false);
    if (error) { setStatus(error.message); return; }
    setStatus("Termin wysłany do sprzedawcy. Skontaktuje się z Tobą w sprawie potwierdzenia.");
    setOpen(false);
  }

  return <>
    <div className="fixed left-4 bottom-4 z-40 flex max-w-[calc(100vw-32px)] flex-wrap gap-2 rounded-2xl p-2 shadow-2xl" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <button disabled={busy} onClick={watch} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)", background: watched ? "rgba(200,150,90,.18)" : "var(--glass)" }}>{watched ? "♥ Obserwujesz" : "♡ Obserwuj cenę"}</button>
      <button onClick={toggleCompare} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)", background: compare ? "rgba(56,224,240,.12)" : "var(--glass)" }}>{compare ? "✓ W porównaniu" : "⇄ Porównaj"}</button>
      <a href="/porownaj" className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Otwórz porównanie</a>
      {allowViewing && <button onClick={() => setOpen(true)} className="rounded-xl px-3 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>📅 Umów oględziny</button>}
    </div>
    {status && <div className="fixed left-4 bottom-20 z-50 max-w-sm rounded-xl px-4 py-3 text-sm shadow-xl" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{status}</div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setOpen(false)}>
      <form onSubmit={submitViewing} onMouseDown={e => e.stopPropagation()} className="w-full max-w-lg rounded-3xl p-6" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Umów oględziny</h2><button type="button" onClick={() => setOpen(false)}>✕</button></div>
        <div className="grid gap-3">
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Imię i nazwisko" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
          <div className="grid gap-3 sm:grid-cols-2"><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="E-mail" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></div>
          <input required value={when} onChange={e => setWhen(e.target.value)} type="datetime-local" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Wiadomość dla sprzedawcy (opcjonalnie)" rows={3} className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
          <button disabled={busy} className="rounded-xl py-3 font-semibold text-black disabled:opacity-60" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Wysyłanie…" : "Wyślij propozycję terminu"}</button>
        </div>
      </form>
    </div>}
  </>;
}
