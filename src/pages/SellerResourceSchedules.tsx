import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Resource={id:string;name:string;kind:string;description:string|null;active:boolean};
type Window={weekday:number;starts_at:string;ends_at:string};
type TimeOff={id:string;starts_at:string;ends_at:string;reason:string|null};
const weekdays=["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
const input="w-full rounded-xl px-3 py-2.5 outline-none";
const style:React.CSSProperties={background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"};
const kindLabel:Record<string,string>={staff:"Pracownik",vehicle:"Pojazd",property:"Nieruchomość",room:"Pomieszczenie",equipment:"Sprzęt",other:"Zasób"};

export default function SellerResourceSchedules(){
 const[resources,setResources]=useState<Resource[]>([]);const[selected,setSelected]=useState("");const[windows,setWindows]=useState<Window[]>([]);const[timeOff,setTimeOff]=useState<TimeOff[]>([]);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
 const[from,setFrom]=useState("");const[to,setTo]=useState("");const[reason,setReason]=useState("");
 const[edit,setEdit]=useState({name:"",kind:"other",description:"",active:true});
 const resource=useMemo(()=>resources.find(r=>r.id===selected)||null,[resources,selected]);
 async function loadResources(){
  const{data,error}=await supabase.schema("market").rpc("seller_booking_resources_manage");
  if(error){setMsg(error.message);return;}
  const rows=(data||[]) as Resource[];setResources(rows);
  setSelected(current=>rows.some(r=>r.id===current)?current:(rows[0]?.id||""));
 }
 async function loadSchedule(id:string){if(!id){setWindows([]);setTimeOff([]);return;}const{data,error}=await supabase.schema("market").rpc("seller_booking_resource_schedule",{p_resource:id});if(error){setMsg(error.message);return;}setWindows(Array.isArray(data?.windows)?data.windows:[]);setTimeOff(Array.isArray(data?.time_off)?data.time_off:[])}
 useEffect(()=>{loadResources()},[]);useEffect(()=>{loadSchedule(selected)},[selected]);
 useEffect(()=>{if(resource)setEdit({name:resource.name,kind:resource.kind,description:resource.description||"",active:resource.active})},[resource]);
 function addWindow(day:number){setWindows(p=>[...p,{weekday:day,starts_at:"08:00",ends_at:"16:00"}].sort((a,b)=>a.weekday-b.weekday||a.starts_at.localeCompare(b.starts_at)))}
 async function save(){if(!selected)return;setBusy(true);setMsg("");const{error}=await supabase.schema("market").rpc("seller_booking_resource_schedule_replace",{p_resource:selected,p_windows:windows});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Grafik zasobu zapisany ✅");await loadSchedule(selected)}
 async function clear(){if(!selected)return;setBusy(true);const{error}=await supabase.schema("market").rpc("seller_booking_resource_schedule_replace",{p_resource:selected,p_windows:[]});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Usunięto indywidualny grafik. Zasób znów dziedziczy godziny całej oferty.");await loadSchedule(selected)}
 async function saveResource(){
  if(!selected||!edit.name.trim()){setMsg("Podaj nazwę zasobu.");return;}
  setBusy(true);setMsg("");
  const{error}=await supabase.schema("market").rpc("seller_booking_resource_update",{p_id:selected,p_name:edit.name.trim(),p_kind:edit.kind,p_description:edit.description||null,p_active:edit.active});
  setBusy(false);
  if(error){setMsg(error.message);return;}
  setMsg(edit.active?"Dane zasobu zapisane ✅":"Zasób wyłączony. Historia rezerwacji została zachowana, ale klienci nie mogą go teraz wybierać.");
  await loadResources();
 }
 async function addOff(){if(!selected||!from||!to){setMsg("Wybierz początek i koniec nieobecności.");return;}const start=new Date(from),end=new Date(to);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start){setMsg("Koniec nieobecności musi być później niż jej początek.");return;}setBusy(true);setMsg("");const{error}=await supabase.schema("market").rpc("seller_booking_resource_time_off_add",{p_resource:selected,p_starts_at:start.toISOString(),p_ends_at:end.toISOString(),p_reason:reason||null});setBusy(false);if(error){setMsg(error.message);return;}setFrom("");setTo("");setReason("");setMsg("Nieobecność dodana ✅");await loadSchedule(selected)}
 async function delOff(id:string){setBusy(true);const{error}=await supabase.schema("market").rpc("seller_booking_resource_time_off_delete",{p_id:id});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Nieobecność usunięta.");await loadSchedule(selected)}
 return <main className="min-h-screen px-4 py-8 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-6xl">
  <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><Link to="/sprzedawca/rezerwacje" className="text-sm underline" style={{color:"var(--mut)"}}>← Rezerwacje i kalendarz</Link><h1 className="mt-2 font-display text-3xl font-semibold">Grafiki i zasoby</h1><p className="mt-1 max-w-2xl text-sm" style={{color:"var(--mut)"}}>Zarządzaj pracownikami, autami, pokojami i sprzętem oraz ich godzinami pracy, urlopami, serwisem i innymi okresami niedostępności.</p></div></div>
  {msg&&<div className="mb-5 rounded-2xl p-4 text-sm" style={{background:"rgba(200,150,90,.12)",border:"1px solid rgba(200,150,90,.25)"}}>{msg}</div>}
  <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
   <aside className="rounded-2xl p-4" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Zasoby</h2><span className="text-xs" style={{color:"var(--mut)"}}>{resources.length}</span></div><div className="mt-3 space-y-2">{resources.map(r=><button key={r.id} onClick={()=>setSelected(r.id)} className="w-full rounded-xl p-3 text-left" style={{border:selected===r.id?"1px solid var(--gold)":"1px solid var(--line)",background:selected===r.id?"rgba(200,150,90,.10)":"transparent",opacity:r.active?1:.6}}><div className="flex items-center justify-between gap-2"><div className="font-semibold">{r.name}</div><span className="rounded-full px-2 py-0.5 text-[10px]" style={{background:r.active?"rgba(122,184,154,.12)":"rgba(148,163,184,.12)",color:r.active?"var(--green)":"var(--mut)"}}>{r.active?"Aktywny":"Wyłączony"}</span></div><div className="text-xs" style={{color:"var(--mut)"}}>{kindLabel[r.kind]||r.kind}</div></button>)}{resources.length===0&&<p className="text-sm" style={{color:"var(--mut)"}}>Najpierw dodaj zasób w ustawieniach bookingu oferty.</p>}</div></aside>
   <section className="space-y-6">{resource&&<>
    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:resource.active?"1px solid var(--line)":"1px solid rgba(148,163,184,.30)"}}>
     <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-semibold tracking-[.14em]" style={{color:"var(--gold)"}}>DANE ZASOBU</div><h2 className="mt-1 text-xl font-semibold">{resource.name}</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{resource.active?"Widoczny w dostępności i może być przydzielany do nowych rezerwacji.":"Wyłączony z nowych rezerwacji. Historia i istniejące rezerwacje pozostają bez zmian."}</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:resource.active?"rgba(122,184,154,.12)":"rgba(148,163,184,.12)",color:resource.active?"var(--green)":"var(--mut)"}}>{resource.active?"● Aktywny":"○ Wyłączony"}</span></div>
     <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Nazwa<input className={`${input} mt-1`} style={style} value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><label className="text-sm">Typ<select className={`${input} mt-1`} style={style} value={edit.kind} onChange={e=>setEdit({...edit,kind:e.target.value})}><option value="staff">Pracownik</option><option value="vehicle">Samochód</option><option value="property">Nieruchomość</option><option value="room">Pokój</option><option value="equipment">Sprzęt</option><option value="other">Inne</option></select></label></div>
     <label className="mt-3 block text-sm">Opis<input className={`${input} mt-1`} style={style} value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})} placeholder="Np. numer rejestracyjny, numer pokoju, model urządzenia"/></label>
     <label className="mt-3 flex items-center justify-between gap-4 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><span><b>Aktywny dla nowych rezerwacji</b><span className="block text-xs" style={{color:"var(--mut)"}}>Wyłącz zamiast usuwać, gdy auto jest w serwisie długoterminowym albo egzemplarz wycofujesz z oferty.</span></span><input type="checkbox" checked={edit.active} onChange={e=>setEdit({...edit,active:e.target.checked})}/></label>
     <button disabled={busy||!edit.name.trim()} onClick={saveResource} className="mt-4 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{busy?"Zapisuję…":"Zapisz dane zasobu"}</button>
    </div>

    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Grafik: {resource.name}</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{kindLabel[resource.kind]||resource.kind} · {windows.length?"indywidualny grafik":"dziedziczy grafik oferty"}</p></div>{windows.length>0&&<button disabled={busy} onClick={clear} className="rounded-xl px-3 py-2 text-sm" style={{border:"1px solid var(--line)"}}>Przywróć grafik oferty</button>}</div>
     <div className="mt-5 flex flex-wrap gap-2">{weekdays.map((d,i)=><button key={d} onClick={()=>addWindow(i)} className="rounded-lg px-3 py-1.5 text-xs" style={{border:"1px solid var(--line)"}}>+ {d}</button>)}</div>
     <div className="mt-4 space-y-2">{windows.map((w,i)=><div key={`${w.weekday}-${i}-${w.starts_at}`} className="grid grid-cols-[40px_1fr_1fr_32px] items-center gap-2"><b className="text-sm">{weekdays[w.weekday]}</b><input type="time" className={input} style={style} value={w.starts_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,starts_at:e.target.value}:x))}/><input type="time" className={input} style={style} value={w.ends_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,ends_at:e.target.value}:x))}/><button onClick={()=>setWindows(p=>p.filter((_,j)=>j!==i))} className="text-xl">×</button></div>)}</div>
     <div className="mt-3 rounded-xl p-3 text-xs" style={{background:"rgba(56,224,240,.06)",color:"var(--mut)"}}>Przerwę ustaw przez dwa okna, np. 08:00–12:00 i 13:00–18:00. Możesz dodać kilka przedziałów tego samego dnia.</div>
     <button disabled={busy} onClick={save} className="mt-4 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zapisz grafik</button>
    </div>
    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><h2 className="text-xl font-semibold">Urlopy, serwis i dni wolne</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Jednorazowa niedostępność ma pierwszeństwo przed cotygodniowym grafikiem.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Od<input type="datetime-local" className={`${input} mt-1`} style={style} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Do<input type="datetime-local" className={`${input} mt-1`} style={style} value={to} onChange={e=>setTo(e.target.value)}/></label></div><input className={`${input} mt-3`} style={style} placeholder="Powód, np. urlop / serwis auta" value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy||!from||!to} onClick={addOff} className="mt-3 w-full rounded-xl py-3 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj niedostępność</button>
     <div className="mt-5 space-y-2">{timeOff.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{border:"1px solid var(--line)"}}><div><div className="font-semibold">{t.reason||"Niedostępny"}</div><div className="text-xs" style={{color:"var(--mut)"}}>{new Date(t.starts_at).toLocaleString("pl-PL")} → {new Date(t.ends_at).toLocaleString("pl-PL")}</div></div><button disabled={busy} onClick={()=>delOff(t.id)} className="text-sm underline">Usuń</button></div>)}{timeOff.length===0&&<p className="text-sm" style={{color:"var(--mut)"}}>Brak zapisanych nieobecności.</p>}</div>
    </div></>}
   </section>
  </div>
 </div></main>
}