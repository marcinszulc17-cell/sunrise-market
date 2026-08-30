import { FormEvent, useEffect, useMemo, useState } from "react";
import { bookingPublicConfig, toggleWatch, watchedIds, type BookingConfig } from "../lib/api";
import { supabase } from "../lib/supabase";
import BookingPurchaseModal from "./BookingPurchaseModal";

type Props = { offerId: string; categorySlug?: string; priceGross?: number | null };
type Interaction = { type:"viewing"|"consultation"|"installation"|"quote"|"demo"|"reservation"|"contact"; label:string; title:string; needsDate:boolean; icon:string };
const COMPARE_KEY = "sunrise_compare_ids";

function interactionFor(slug:string):Interaction {
  const s=slug.toLowerCase();
  if(s.startsWith("nieruchomosci-")||s.includes("motoryzacja-samochody")) return {type:"viewing",label:"Umów oględziny",title:"Umów oględziny",needsDate:true,icon:"📅"};
  if(s.includes("fotowolta")||s.includes("magazyn")||s.includes("pompy-ciepla")||s.includes("klimatyz")||s.includes("termomod")||s.includes("instalac")) return {type:"installation",label:"Umów dobór / montaż",title:"Umów dobór lub montaż",needsDate:true,icon:"🛠️"};
  if(s.startsWith("uslugi-")||s.includes("ubezpiec")||s.includes("finans")||s.includes("dorad")) return {type:"consultation",label:"Umów konsultację",title:"Umów konsultację",needsDate:true,icon:"💬"};
  if(s.includes("motoryzacja-")||s.includes("elektronik")||s.includes("agd")||s.includes("maszyn")) return {type:"demo",label:"Umów prezentację",title:"Umów prezentację / demo",needsDate:true,icon:"▶️"};
  if(s.includes("podroz")||s.includes("hotel")||s.includes("nocleg")||s.includes("wynajem")) return {type:"reservation",label:"Zapytaj o rezerwację",title:"Zapytaj o rezerwację",needsDate:true,icon:"🗓️"};
  if(s.startsWith("ogloszenia-lokalne-")||s.includes("budow")||s.includes("dom-ogrod")) return {type:"quote",label:"Poproś o wycenę",title:"Poproś o wycenę",needsDate:false,icon:"🧾"};
  return {type:"contact",label:"Zapytaj sprzedawcę",title:"Skontaktuj się ze sprzedawcą",needsDate:false,icon:"✉️"};
}

export default function BuyerOfferActions({ offerId, categorySlug="" }: Props) {
  const action=useMemo(()=>interactionFor(categorySlug),[categorySlug]);
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
  const [bookingConfig,setBookingConfig]=useState<BookingConfig|null>(null);
  const [bookingOpen,setBookingOpen]=useState(false);

  useEffect(() => {
    watchedIds().then(ids => setWatched(ids.includes(offerId))).catch(() => {});
    try { setCompare(JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]").includes(offerId)); } catch { /* ignore */ }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
    bookingPublicConfig(offerId).then(setBookingConfig).catch(()=>setBookingConfig(null));
  }, [offerId]);

  async function watch() {
    setBusy(true); setStatus(null);
    try {
      const on = await toggleWatch(offerId);
      setWatched(on);
      if (on) {
        await supabase.rpc("set_watch_alert", { p_offer: offerId, p_enabled: true });
        setStatus("Obserwujesz ofertę. Powiadomimy Cię, gdy cena spadnie.");
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
    else { if (ids.length >= 4) ids = ids.slice(1); ids.push(offerId); }
    localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
    setCompare(ids.includes(offerId));
    setStatus(ids.includes(offerId) ? `Dodano do porównania (${ids.length}/4).` : "Usunięto z porównania.");
  }

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  }

  async function submitInteraction(e: FormEvent) {
    e.preventDefault(); setBusy(true); setStatus(null);
    let iso:string|null=null;
    try { iso=action.needsDate&&when ? new Date(when).toISOString() : null; } catch { setBusy(false); setStatus("Wybierz prawidłowy termin."); return; }
    const { error } = await supabase.rpc("create_interaction_request", {
      p_offer: offerId, p_type: action.type, p_name: name, p_email: email || null, p_phone: phone || null,
      p_appointment_at: iso, p_message: message || null,
    });
    setBusy(false);
    if (error) { setStatus(error.message); return; }
    setStatus(action.needsDate ? "Propozycja została wysłana do sprzedawcy." : "Wiadomość została wysłana do sprzedawcy.");
    setOpen(false);
  }

  return <>
    <button onClick={goBack} className="fixed left-3 top-[calc(env(safe-area-inset-top)+10px)] z-50 rounded-full px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur-md sm:left-4 sm:top-4" style={{ background: "color-mix(in srgb, var(--header) 94%, transparent)", border: "1px solid var(--line)" }} aria-label="Wróć do poprzedniej strony">← Wróć</button>

    <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 overflow-x-auto p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-md sm:bottom-auto sm:left-auto sm:right-4 sm:top-[72px] sm:max-w-[calc(100vw-32px)] sm:flex-wrap sm:justify-end sm:rounded-2xl sm:p-2 sm:shadow-xl" style={{ background: "color-mix(in srgb, var(--header) 96%, transparent)", borderTop: "1px solid var(--line)", border: "1px solid var(--line)" }}>
      <button disabled={busy} onClick={watch} className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm" style={{ border: "1px solid var(--line)", background: watched ? "rgba(200,150,90,.18)" : "var(--glass)" }}>{watched ? "♥ Obserwujesz" : "♡ Obserwuj"}</button>
      <button onClick={toggleCompare} className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm" style={{ border: "1px solid var(--line)", background: compare ? "rgba(56,224,240,.12)" : "var(--glass)" }}>{compare ? "✓ Porównanie" : "⇄ Porównaj"}</button>
      <a href="/porownaj" className="hidden shrink-0 rounded-xl px-3 py-2 text-sm font-semibold sm:block" style={{ border: "1px solid var(--line)", background:"var(--glass)" }}>Porównanie</a>
      <button onClick={() => bookingConfig ? setBookingOpen(true) : setOpen(true)} className="min-w-[150px] flex-1 shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-black sm:flex-none sm:text-sm" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{bookingConfig ? "📅 Termin i płatność" : `${action.icon} ${action.label}`}</button>
    </div>
    {status && <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-3 right-3 z-50 rounded-xl px-4 py-3 text-sm shadow-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-[132px] sm:max-w-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{status}</div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setOpen(false)}>
      <form onSubmit={submitInteraction} onMouseDown={e => e.stopPropagation()} className="w-full max-w-lg rounded-3xl p-6" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{action.title}</h2><button type="button" onClick={() => setOpen(false)}>✕</button></div>
        <div className="grid gap-3">
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Imię i nazwisko" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
          <div className="grid gap-3 sm:grid-cols-2"><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="E-mail" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></div>
          {action.needsDate&&<input required value={when} onChange={e => setWhen(e.target.value)} type="datetime-local" className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />}
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={action.type==="quote"?"Napisz, czego potrzebujesz do wyceny":"Wiadomość dla sprzedawcy (opcjonalnie)"} rows={3} className="rounded-xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
          <button disabled={busy} className="rounded-xl py-3 font-semibold text-black disabled:opacity-60" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Wysyłanie…" : action.label}</button>
        </div>
      </form>
    </div>}
    {bookingConfig && <BookingPurchaseModal offerId={offerId} config={bookingConfig} open={bookingOpen} onClose={() => setBookingOpen(false)} />}
  </>;
}
