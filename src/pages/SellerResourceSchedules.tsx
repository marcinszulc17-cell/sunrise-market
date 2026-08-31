import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Resource={id:string;name:string;kind:string;description:string|null;active:boolean};
type Window={weekday:number;starts_at:string;ends_at:string};
type TimeOff={id:string;starts_at:string;ends_at:string;reason:string|null};
const weekdays=["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
const input="w-full rounded-xl px-3 py-2.5 outline-none";
const style:React.CSSProperties={background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"};
const kindLabel:Record<string,string>={staff:"Pracownik",vehicle:"Pojazd",property:"Nieruchomość",room:"Pomieszczenie",equipment:"Sprzęt",other:"Zasób"};

export default function SellerResourceSchedules(){
 const[sp,setSp]=useSearchParams();
 const requested=sp.get("resource")||"";
 const[resources,setResources]=useState<Resource[]>([]);const[selected,setSelected]=useState("");const[windows,setWindows]=useState<Window[]>([]);const[timeOff,setTimeOff]=useState<TimeOff[]>([]);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
 const[from,setFrom]=useState("");const[to,setTo]=useState("");const[reason,setReason]=useState("");
 const[editName,setEditName]=useState("");const[editDescription,setEditDescription]=useState("");
 const resource=useMemo(()=>resources.find(r=>r.id===selected)||null,[resources,selected]);

 function selectResource(id:string){
  setSelected(id);
  const next=new URLSearchParams(sp);next.set("resource",id);setSp(next,{replace:true});
 }
 async function loadResources(){
  const{data,error}=await supabase.rpc("seller_booking_resources_dashboard");
  if(error){setMsg(error.message);return;}
  const rows=(data||[]) as Resource[];setResources(rows);
  const target=(requested&&rows.some(r=>r.id===requested)?requested:"")||(selected&&rows.some(r=>r.id===selected)?selected:"")||rows[0]?.id||"";
  if(target&&target!==selected)setSelected(target);
 }
 async function loadSchedule(id:string){
  if(!id){setWindows([]);setTimeOff([]);return;}
  const{data,error}=await supabase.schema("market").rpc("seller_booking_resource_schedule",{p_resource:id});
  if(error){setMsg(error.message);return;}
  setWindows(Array.isArray(data?.windows)?data.windows:[]);setTimeOff(Array.isArray(data?.time_off)?data.time_off:[]);
 }
 useEffect(()=>{loadResources()},[]);
 useEffect(()=>{loadSchedule(selected)},[selected]);
 useEffect(()=>{if(resource){setEditName(resource.name);setEditDescription(resource.description||"")}},[resource?.id,resource?.name,resource?.description]);

 function addWindow(day:number){setWindows(p=>[...p,{weekday:day,starts_at:"08:00",ends_at:"16:00"}].sort((a,b)=>a.weekday-b.weekday||a.starts_at.localeCompare(b.starts_at)))}
 async function save(){if(!selected)return;setBusy(true);setMsg("");const{error}=await supabase.schema("market").rpc("seller_booking_resource_schedule_replace",{p_resource:selected,p_windows:windows});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Grafik zasobu zapisany ✅");await loadSchedule(selected)}
 async function clear(){if(!selected)return;setBusy(true);const{error}=await supabase.schema("market").rpc("seller_booking_resource_schedule_replace",{p_resource:selected,p_windows:[]});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Usunięto indywidualny grafik. Zasób znów dziedziczy godziny całej oferty.");await loadSchedule(selected)}
 async function addOff(){if(!selected||!from||!to){setMsg("Wybierz początek i koniec nieobecności.");return;}if(new Date(to)<=new Date(from)){setMsg("Koniec niedostępności musi być później niż początek.");return;}setBusy(true);setMsg("");const{error}=await supabase.schema("market").rpc("seller_booking_resource_time_off_add",{p_resource:selected,p_starts_at:new Date(from).toISOString(),p_ends_at:new Date(to).toISOString(),p_reason:reason||null});setBusy(false);if(error){setMsg(error.message);return;}setFrom("");setTo("");setReason("");setMsg("Niedostępność dodana ✅");await loadSchedule(selected)}
 async function delOff(id:string){setBusy(true);const{error}=await supabase.schema("market").rpc("seller_booking_resource_time_off_delete",{p_id:id});setBusy(false);if(error){setMsg(error.message);return;}setMsg("Niedostępność usunięta.");await loadSchedule(selected)}
 async function saveResource(){
  if(!resource||!editName.trim()){setMsg("Podaj nazwę zasobu.");return;}
  setBusy(true);setMsg("");
  const{error}=await supabase.schema("market").rpc("seller_booking_resource_upsert",{p_offer:null,p_id:resource.id,p_name:editName.trim(),p_kind:resource.kind,p_description:editDescription.trim()||null,p_active:true});
  setBusy(false);
  if(error){setMsg(error.message);return;}
  setMsg("Dane zasobu zapisane ✅");await loadResources();
 }

 return <main className="min-h-screen px-4 py-8 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-6xl">
  <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><Link to="/sprzedawca/rezerwacje" className="text-sm underline" style={{color:"var(--mut)"}}>← Rezerwacje i kalendarz</Link><h1 className="mt-2 font-display text-3xl font-semibold">Grafiki zasobów</h1><p className="mt-1 max-w-2xl text-sm" style={{color:"var(--mut)"}}>Osobne godziny pracy, serwis, urlopy i dni wolne dla pracowników, aut, pomieszczeń i sprzętu. Możesz też nazwać konkretny egzemplarz np. numerem rejestracyjnym lub numerem apartamentu.</p></div></div>
  {msg&&<div className="mb-5 rounded-2xl p-4 text-sm" style={{background:"rgba(200,150,90,.12)",border:"1px solid rgba(200,150,90,.25)"}}>{msg}</div>}
  <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
   <aside className="rounded-2xl p-4" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><h2 className="font-semibold">Zasoby</h2><div className="mt-3 space-y-2">{resources.map(r=><button key={r.id} onClick={()=>selectResource(r.id)} className="w-full rounded-xl p-3 text-left" style={{border:selected===r.id?"1px solid var(--gold)":"1px solid var(--line)",background:selected===r.id?"rgba(200,150,90,.10)":"transparent"}}><div className="font-semibold">{r.name}</div><div className="text-xs" style={{color:"var(--mut)"}}>{kindLabel[r.kind]||r.kind}{r.description?` · ${r.description}`:""}</div></button>)}{resources.length===0&&<p className="text-sm" style={{color:"var(--mut)"}}>Najpierw dodaj zasób w ustawieniach bookingu oferty.</p>}</div></aside>
   <section className="space-y-6">{resource&&<>
    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
     <div><h2 className="text-xl font-semibold">Dane egzemplarza</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Ułatw sobie rozpoznanie auta, apartamentu, pokoju lub sprzętu w kalendarzu i rezerwacjach.</p></div>
     <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Nazwa<input className={`${input} mt-1`} style={style} value={editName} onChange={e=>setEditName(e.target.value)} placeholder="np. Toyota Yaris · PNT 12345"/></label><label className="text-sm">Opis / oznaczenie<input className={`${input} mt-1`} style={style} value={editDescription} onChange={e=>setEditDescription(e.target.value)} placeholder="np. biały, miejsce 12 / apartament 204"/></label></div>
     <button disabled={busy||!editName.trim()} onClick={saveResource} className="mt-3 rounded-xl px-4 py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>Zapisz dane zasobu</button>
    </div>

    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{resource.name}</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{kindLabel[resource.kind]||resource.kind} · {windows.length?"indywidualny grafik":"dziedziczy grafik oferty"}</p></div>{windows.length>0&&<button disabled={busy} onClick={clear} className="rounded-xl px-3 py-2 text-sm" style={{border:"1px solid var(--line)"}}>Przywróć grafik oferty</button>}</div>
     <div className="mt-5 flex flex-wrap gap-2">{weekdays.map((d,i)=><button key={d} onClick={()=>addWindow(i)} className="rounded-lg px-3 py-1.5 text-xs" style={{border:"1px solid var(--line)"}}>+ {d}</button>)}</div>
     <div className="mt-4 space-y-2">{windows.map((w,i)=><div key={`${w.weekday}-${i}-${w.starts_at}`} className="grid grid-cols-[40px_1fr_1fr_32px] items-center gap-2"><b className="text-sm">{weekdays[w.weekday]}</b><input type="time" className={input} style={style} value={w.starts_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,starts_at:e.target.value}:x))}/><input type="time" className={input} style={style} value={w.ends_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,ends_at:e.target.value}:x))}/><button onClick={()=>setWindows(p=>p.filter((_,j)=>j!==i))} className="text-xl">×</button></div>)}</div>
     <div className="mt-3 rounded-xl p-3 text-xs" style={{background:"rgba(56,224,240,.06)",color:"var(--mut)"}}>Przerwę ustaw przez dwa okna, np. 08:00–12:00 i 13:00–18:00. Możesz dodać kilka przedziałów tego samego dnia.</div>
     <button disabled={busy} onClick={save} className="mt-4 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zapisz grafik</button>
    </div>

    <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><h2 className="text-xl font-semibold">Niedostępność / serwis / urlop</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Jednorazowa niedostępność ma pierwszeństwo przed cotygodniowym grafikiem. Dla auta wpisz np. „serwis”, dla pracownika „urlop”.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Od<input type="datetime-local" className={`${input} mt-1`} style={style} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Do<input type="datetime-local" className={`${input} mt-1`} style={style} value={to} onChange={e=>setTo(e.target.value)}/></label></div><input className={`${input} mt-3`} style={style} placeholder="Powód, np. urlop / serwis auta" value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy||!from||!to} onClick={addOff} className="mt-3 w-full rounded-xl py-3 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj niedostępność</button>
     <div className="mt-5 space-y-2">{timeOff.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{border:"1px solid var(--line)"}}><div><div className="font-semibold">{t.reason||"Niedostępny"}</div><div className="text-xs" style={{color:"var(--mut)"}}>{new Date(t.starts_at).toLocaleString("pl-PL")} → {new Date(t.ends_at).toLocaleString("pl-PL")}</div></div><button disabled={busy} onClick={()=>delOff(t.id)} className="text-sm underline">Usuń</button></div>)}{timeOff.length===0&&<p className="text-sm" style={{color:"var(--mut)"}}>Brak zapisanych niedostępności.</p>}</div>
    </div></>}
   </section>
  </div>
 </div></main>
}