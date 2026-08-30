import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SellerBookingCalendar from "../components/SellerBookingCalendar";

const statusLabel: Record<string,string> = {
  held: "Termin zablokowany",
  pending_payment: "Oczekuje na płatność",
  confirmed: "Potwierdzona",
  completed: "Zakończona",
  cancelled: "Anulowana",
  expired: "Wygasła",
};

type Booking = {
  id:string; offer_id:string; title:string; buyer_name:string|null; buyer_email:string|null; booking_type:string;
  starts_at:string; ends_at:string; units:number; amount_gross:number; status:string; payment_provider:string|null; paid_at:string|null;
};
type Block = { id:string; offer_id:string; title:string; starts_at:string; ends_at:string; reason:string|null };
type Offer = { offer_id:string; title:string; status:string };

const pln = (v:number) => Number(v||0).toLocaleString("pl-PL", { style:"currency", currency:"PLN" });
const dt = (iso:string, time=true) => new Date(iso).toLocaleString("pl-PL", time ? { dateStyle:"medium", timeStyle:"short" } : { dateStyle:"medium" });
const localInput = (d:Date) => {
  const pad=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localDate = (d:Date) => localInput(d).slice(0,10);
const addDays = (d:Date,n:number) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };

export default function SellerBookingsManage() {
  const [rows,setRows] = useState<Booking[]>([]);
  const [blocks,setBlocks] = useState<Block[]>([]);
  const [offers,setOffers] = useState<Offer[]>([]);
  const [loading,setLoading] = useState(true);
  const [msg,setMsg] = useState("");
  const [filter,setFilter] = useState("active");
  const [offerId,setOfferId] = useState("");
  const [start,setStart] = useState("");
  const [end,setEnd] = useState("");
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false);
  const [rescheduleId,setRescheduleId] = useState<string|null>(null);
  const [rescheduleValue,setRescheduleValue] = useState("");
  const [rescheduleBusy,setRescheduleBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [b,bl,o] = await Promise.all([
      supabase.rpc("seller_booking_dashboard"),
      supabase.rpc("seller_booking_blocks"),
      supabase.rpc("my_offers"),
    ]);
    if (b.error) setMsg(b.error.message); else setRows((b.data||[]) as Booking[]);
    if (!bl.error) setBlocks((bl.data||[]) as Block[]);
    if (!o.error) setOffers((o.data||[]) as Offer[]);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  const visible = useMemo(()=>rows.filter(r => filter === "all" ? true : filter === "active" ? ["held","pending_payment","confirmed"].includes(r.status) : r.status===filter),[rows,filter]);
  const stats = useMemo(()=>({
    active: rows.filter(r=>["held","pending_payment","confirmed"].includes(r.status)).length,
    confirmed: rows.filter(r=>r.status==="confirmed").length,
    paid: rows.filter(r=>!!r.paid_at).reduce((a,r)=>a+Number(r.amount_gross||0),0),
  }),[rows]);

  async function setStatus(id:string,status:"confirmed"|"cancelled"|"completed") {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_booking_set_status", { p_booking:id, p_status:status });
    if (error) setMsg(error.message); else { setMsg("Status rezerwacji zaktualizowany. Powiadomienie e-mail zostało dodane do wysyłki."); await load(); }
    setBusy(false);
  }

  function openReschedule(r:Booking) {
    setRescheduleId(r.id);
    setRescheduleValue(r.booking_type === "daily" ? localDate(new Date(r.starts_at)) : localInput(new Date(r.starts_at)));
    setMsg("");
  }

  async function runReschedule(r:Booking,startValue:string) {
    setRescheduleBusy(true); setMsg("");
    try {
      const { error } = await supabase.rpc("seller_booking_reschedule", { p_booking:r.id, p_starts_at:startValue });
      if (error) throw error;
      setRescheduleId(null); setRescheduleValue("");
      setMsg("Termin zmieniony ✅ System sprawdził kolizje, a klient otrzyma powiadomienie w aplikacji/push.");
      await load();
      return true;
    } catch (e) {
      setMsg("Nie udało się zmienić terminu: " + (e as Error).message);
      return false;
    } finally { setRescheduleBusy(false); }
  }

  async function reschedule(r:Booking) {
    if (!rescheduleValue) { setMsg("Wybierz nowy termin rezerwacji."); return; }
    const startValue = r.booking_type === "daily"
      ? new Date(`${rescheduleValue}T12:00:00`).toISOString()
      : new Date(rescheduleValue).toISOString();
    await runReschedule(r,startValue);
  }

  async function rescheduleFromCalendar(bookingId:string,targetDay:Date) {
    const r=rows.find(x=>x.id===bookingId);
    if (!r || r.status!=="confirmed") { setMsg("Przeciągać można tylko potwierdzone rezerwacje."); return false; }
    const current=new Date(r.starts_at);
    const target=new Date(targetDay);
    if (r.booking_type==="daily") {
      const startValue=new Date(target.getFullYear(),target.getMonth(),target.getDate(),12,0,0,0).toISOString();
      return runReschedule(r,startValue);
    }
    target.setHours(current.getHours(),current.getMinutes(),current.getSeconds(),0);
    return runReschedule(r,target.toISOString());
  }

  async function addBlock() {
    if (!offerId || !start || !end) { setMsg("Wybierz ofertę i zakres blokady."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_booking_block_add", { p_offer:offerId, p_starts_at:new Date(start).toISOString(), p_ends_at:new Date(end).toISOString(), p_reason:reason || null });
    if (error) setMsg(error.message); else { setStart(""); setEnd(""); setReason(""); setMsg("Termin został zablokowany i nie będzie dostępny dla klientów."); await load(); }
    setBusy(false);
  }

  async function deleteBlock(id:string) {
    setBusy(true); const { error } = await supabase.rpc("seller_booking_block_delete", { p_block:id });
    if (error) setMsg(error.message); else { setMsg("Blokada usunięta."); await load(); }
    setBusy(false);
  }

  function pickCalendarDate(from:Date,to:Date) {
    setStart(localInput(from));
    setEnd(localInput(to));
    document.getElementById("block-editor")?.scrollIntoView({ behavior:"smooth", block:"center" });
  }

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><Link to="/sprzedawca" className="text-sm underline" style={{color:"var(--mut)"}}>← Centrum sprzedawcy</Link><h1 className="mt-2 font-display text-3xl font-semibold">Rezerwacje i kalendarz</h1><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Jeden kalendarz dla usług, samochodów, nieruchomości, produktów i sprzętu.</p></div>
        <Link to="/sprzedawca/oferty" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>Zarządzaj ofertami</Link>
      </div>

      {msg && <div className="mb-5 rounded-2xl p-4 text-sm" style={{background:"rgba(200,150,90,.12)",border:"1px solid rgba(200,150,90,.25)"}}>{msg}</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Aktywne rezerwacje" value={String(stats.active)} />
        <Stat label="Potwierdzone" value={String(stats.confirmed)} />
        <Stat label="Wartość opłaconych" value={pln(stats.paid)} />
      </div>

      <SellerBookingCalendar bookings={rows} blocks={blocks} onPickDate={pickCalendarDate} onRescheduleDrop={rescheduleFromCalendar} rescheduleBusy={rescheduleBusy}/>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold">Lista rezerwacji</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Kliknięcie zdarzenia w kalendarzu przewija do jego szczegółów tutaj. Potwierdzone rezerwacje możesz też przeciągnąć na inny dzień.</p></div>
            <div className="flex flex-wrap gap-2">{[['active','Aktywne'],['confirmed','Potwierdzone'],['pending_payment','Do opłacenia'],['completed','Zakończone'],['cancelled','Anulowane'],['all','Wszystkie']].map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className="rounded-full px-3 py-1.5 text-sm" style={{background:filter===k?"rgba(200,150,90,.18)":"var(--glass)",border:"1px solid var(--line)",color:filter===k?"var(--gold)":"var(--ink)"}}>{l}</button>)}</div>
          </div>
          {loading && <p style={{color:"var(--mut)"}}>Ładowanie…</p>}
          {!loading && visible.length===0 && <div className="rounded-2xl p-6" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>Brak rezerwacji w tym widoku.</div>}
          <div className="space-y-3">{visible.map(r=>{
            const durationMinutes=Math.max(1,Math.round((new Date(r.ends_at).getTime()-new Date(r.starts_at).getTime())/60000));
            const previewEnd=r.booking_type==="daily"&&rescheduleId===r.id&&rescheduleValue?addDays(new Date(`${rescheduleValue}T12:00:00`),r.units):null;
            return <article id={`booking-${r.id}`} key={r.id} className="scroll-mt-24 rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><Link to={`/produkt/${r.offer_id}`} className="font-semibold hover:underline">{r.title}</Link><div className="mt-1 text-sm" style={{color:"var(--mut)"}}>{r.booking_type==="daily"?`${dt(r.starts_at,false)} – ${dt(r.ends_at,false)} · ${r.units} dni`:dt(r.starts_at,true)}</div></div>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:r.status==="confirmed"?"rgba(34,197,94,.12)":"var(--header)",border:"1px solid var(--line)"}}>{statusLabel[r.status]||r.status}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><div><span style={{color:"var(--mut)"}}>Klient</span><div>{r.buyer_name || r.buyer_email || "—"}</div></div><div><span style={{color:"var(--mut)"}}>Płatność</span><div>{r.paid_at?`Opłacono · ${r.payment_provider||""}`:"Nieopłacona"}</div></div><div><span style={{color:"var(--mut)"}}>Kwota</span><div className="font-semibold">{pln(r.amount_gross)}</div></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/sprzedawca/rezerwacje/ustawienia/${r.offer_id}`} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>⚙ Ustawienia bookingu</Link>
              {r.status==="confirmed" && <button disabled={busy||rescheduleBusy} onClick={()=>openReschedule(r)} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>↔ Zmień termin</button>}
              {r.status==="confirmed" && <button disabled={busy||rescheduleBusy} onClick={()=>setStatus(r.id,"completed")} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>✓ Zakończ</button>}
              {["held","pending_payment"].includes(r.status) && r.paid_at && <button disabled={busy||rescheduleBusy} onClick={()=>setStatus(r.id,"confirmed")} className="rounded-xl px-3 py-2 text-sm font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Potwierdź</button>}
              {["held","pending_payment","confirmed"].includes(r.status) && <button disabled={busy||rescheduleBusy} onClick={()=>setStatus(r.id,"cancelled")} className="rounded-xl px-3 py-2 text-sm" style={{border:"1px solid rgba(239,68,68,.35)"}}>Anuluj</button>}
              {r.buyer_email && <a href={`mailto:${r.buyer_email}`} className="rounded-xl px-3 py-2 text-sm" style={{border:"1px solid var(--line)"}}>✉️ Napisz do klienta</a>}
            </div>
            {r.status==="confirmed"&&rescheduleId===r.id&&<div className="mt-4 rounded-2xl p-4" style={{background:"rgba(200,150,90,.07)",border:"1px solid rgba(200,150,90,.25)"}}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">Zmień termin rezerwacji</div><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>{r.booking_type==="daily"?`Okres pozostaje bez zmian: ${r.units} dni.`:`Czas usługi pozostaje bez zmian: ${durationMinutes} min.`} Cena {pln(r.amount_gross)} również się nie zmienia.</div></div><button type="button" onClick={()=>{setRescheduleId(null);setRescheduleValue("")}} aria-label="Zamknij">✕</button></div>
              <label className="mt-4 block text-sm"><span className="mb-1 block">{r.booking_type==="daily"?"Nowa data rozpoczęcia":"Nowy dzień i godzina"}</span><input type={r.booking_type==="daily"?"date":"datetime-local"} value={rescheduleValue} onChange={e=>setRescheduleValue(e.target.value)} className="w-full rounded-xl px-3 py-2.5" style={{background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"}}/></label>
              {previewEnd&&<div className="mt-2 text-xs" style={{color:"var(--mut)"}}>Nowy okres: {new Date(`${rescheduleValue}T12:00:00`).toLocaleDateString("pl-PL")} – {previewEnd.toLocaleDateString("pl-PL")}</div>}
              <div className="mt-3 rounded-xl p-3 text-xs" style={{background:"var(--header)",color:"var(--mut)"}}>Przed zapisem system sprawdzi dostępność oferty, zasobu, inne rezerwacje i ręczne blokady. Po zmianie klient otrzyma powiadomienie w aplikacji/push.</div>
              <button disabled={rescheduleBusy||!rescheduleValue} onClick={()=>reschedule(r)} className="mt-3 w-full rounded-xl py-2.5 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{rescheduleBusy?"Sprawdzam termin…":"Sprawdź i zmień termin"}</button>
            </div>}
          </article>})}</div>
        </section>

        <aside className="space-y-5">
          <div id="block-editor" className="scroll-mt-24 rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
            <h2 className="text-lg font-semibold">Oferta i blokada terminu</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Kliknij dzień w kalendarzu, a godziny uzupełnią się automatycznie. Potem wybierz ofertę i zapisz blokadę.</p>
            <select value={offerId} onChange={e=>setOfferId(e.target.value)} className="mt-4 w-full rounded-xl px-3 py-2.5" style={{background:"var(--bg)",border:"1px solid var(--line)"}}><option value="">Wybierz ofertę</option>{offers.map(o=><option key={o.offer_id} value={o.offer_id}>{o.title}</option>)}</select>
            {offerId&&<Link to={`/sprzedawca/rezerwacje/ustawienia/${offerId}`} className="mt-3 block w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>⚙ Zaawansowane ustawienia bookingu</Link>}
            <h3 className="mt-5 font-semibold">Zablokuj termin</h3>
            <label className="mt-3 block text-xs" style={{color:"var(--mut)"}}>Od<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5" style={{background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"}}/></label>
            <label className="mt-3 block text-xs" style={{color:"var(--mut)"}}>Do<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5" style={{background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"}}/></label>
            <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Powód (opcjonalnie)" className="mt-3 w-full rounded-xl px-3 py-2.5" style={{background:"var(--bg)",border:"1px solid var(--line)"}} />
            <button disabled={busy} onClick={addBlock} className="mt-3 w-full rounded-xl px-4 py-2.5 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zablokuj termin</button>
          </div>
          <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><h2 className="text-lg font-semibold">Najbliższe blokady</h2><div className="mt-3 space-y-2">{blocks.slice(0,8).map(b=><div key={b.id} className="rounded-xl p-3 text-sm" style={{border:"1px solid var(--line)"}}><div className="font-semibold">{b.title}</div><div className="mt-1" style={{color:"var(--mut)"}}>{dt(b.starts_at)} – {dt(b.ends_at)}</div>{b.reason&&<div className="mt-1">{b.reason}</div>}<button onClick={()=>deleteBlock(b.id)} className="mt-2 text-xs underline" style={{color:"var(--mut)"}}>Usuń blokadę</button></div>)}{blocks.length===0&&<p className="text-sm" style={{color:"var(--mut)"}}>Brak ręcznych blokad.</p>}</div></div>
          <div className="rounded-2xl p-5 text-sm" style={{background:"rgba(122,184,154,.08)",border:"1px solid rgba(122,184,154,.22)"}}><b>Powiadomienia</b><p className="mt-1" style={{color:"var(--mut)"}}>System wysyła wiadomości dla standardowych zmian statusów i przypomnienia. Przy zmianie terminu klient dostaje powiadomienie w aplikacji/push.</p></div>
        </aside>
      </div>
    </div>
  </main>;
}

function Stat({label,value}:{label:string;value:string}) { return <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="text-sm" style={{color:"var(--mut)"}}>{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
