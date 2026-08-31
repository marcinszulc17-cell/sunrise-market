import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { configureBookingOffer, replaceBookingAvailability, type BookingWindow } from "../lib/api";
import ServiceResourceAssignments from "../components/ServiceResourceAssignments";
import { supabase } from "../lib/supabase";

const input="w-full rounded-xl px-3 py-2.5 outline-none";
const style:React.CSSProperties={background:"var(--glass)",border:"1px solid var(--line)",color:"var(--ink)"};
const weekdays=["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
type Cat={offer?:{category_slug?:string;offer_type?:string};config:any;services:any[];resources:any[];service_resources:{service_id:string;resource_id:string}[];rates:any[]};

export default function SellerBookingSetup(){
 const {offerId}=useParams(); const [sp]=useSearchParams(); const isNew=sp.get("new")==="1";
 const [cat,setCat]=useState<Cat|null>(null); const [msg,setMsg]=useState(""); const [busy,setBusy]=useState(false);
 const [service,setService]=useState({name:"",description:"",duration:60,price:0,before:0,after:0});
 const [resource,setResource]=useState({name:"",kind:"staff",description:""});
 const [resourceCount,setResourceCount]=useState(1);
 const [rate,setRate]=useState({from:"",to:"",price:0,minUnits:1,label:""});
 const [extras,setExtras]=useState({minUnits:1,maxUnits:30,cleaning:0,deposit:0,instant:true});
 const [windows,setWindows]=useState<BookingWindow[]>([]); const [active,setActive]=useState(false);

 async function load(){
  if(!offerId)return;
  const {data,error}=await supabase.schema("market").rpc("seller_booking_catalog_v2",{p_offer:offerId});
  if(error){setMsg(error.message);return;}
  const c=data as Cat; setCat(c);
  if(c?.config){
   setExtras({minUnits:Number(c.config.min_units||1),maxUnits:Number(c.config.max_units||30),cleaning:Number(c.config.cleaning_fee_gross||0),deposit:Number(c.config.deposit_gross||0),instant:Boolean(c.config.instant_booking)});
   setWindows(Array.isArray(c.config.weekly_availability)?c.config.weekly_availability:[]);
   setActive(Boolean(c.config.active));
  }
 }
 useEffect(()=>{load()},[offerId]);
 async function call(name:string,args:any){setBusy(true);setMsg("");const {error}=await supabase.schema("market").rpc(name,args);setBusy(false);if(error){setMsg(error.message);return false;}await load();setMsg("Zapisano ✅");return true;}
 function addWindow(day:number){if(windows.some(w=>w.weekday===day))return;setWindows(p=>[...p,{weekday:day,starts_at:"08:00",ends_at:"18:00"}].sort((a,b)=>a.weekday-b.weekday));}
 async function saveAvailability(){if(!offerId)return;setBusy(true);setMsg("");try{await replaceBookingAvailability(offerId,windows);setMsg("Dostępność zapisana ✅");await load();}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 async function addResources(){
  if(!offerId||!resource.name.trim())return;
  const count=isDaily?Math.max(1,Math.min(50,Math.trunc(resourceCount||1))):1;
  const kind=isDaily&&resource.kind==="staff"?"equipment":resource.kind;
  setBusy(true);setMsg("");
  const {data,error}=await supabase.schema("market").rpc("seller_booking_resources_batch_create",{
   p_offer:offerId,p_name:resource.name.trim(),p_kind:kind,p_description:resource.description||null,p_count:count
  });
  if(error){setMsg(error.message)}else{
   await load();
   const created=Number(data||count);
   setMsg(created>1?`Dodano ${created} egzemplarzy i przypisano je do tej oferty ✅`:"Zasób dodany i przypisany do oferty ✅");
   setResource({name:"",kind:isDaily?"equipment":"staff",description:""});setResourceCount(1);
  }
  setBusy(false);
 }
 async function setBookingActive(next:boolean){
  if(!offerId||!cat?.config)return;
  const isDaily=cat.config.booking_type==="daily";
  if(next&&!isDaily&&windows.length===0){setMsg("Najpierw ustaw co najmniej jeden dzień i godziny dostępności.");return;}
  setBusy(true);setMsg("");
  try{
   if(!isDaily)await replaceBookingAvailability(offerId,windows);
   await configureBookingOffer({offerId,bookingType:cat.config.booking_type,durationMinutes:isDaily?null:Number(cat.config.duration_minutes||60),slotIntervalMinutes:Number(cat.config.slot_interval_minutes||30),minNoticeHours:Number(cat.config.min_notice_hours||2),maxAdvanceDays:Number(cat.config.max_advance_days||365),maxUnits:Number(cat.config.max_units||30),pricePerUnit:Number(cat.config.price_per_unit||0),active:next});
   setActive(next);setMsg(next?"Booking aktywny — klienci mogą już rezerwować ✅":"Booking wyłączony. Oferta nadal jest widoczna, ale kalendarz nie przyjmuje rezerwacji.");await load();
  }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
 }

 if(!offerId)return <Shell><p>Brak oferty.</p></Shell>;
 const isDaily=cat?.config?.booking_type==="daily"; const slug=String(cat?.offer?.category_slug||""); const isCarRental=isDaily&&slug.startsWith("motoryzacja-");
 return <Shell>
  <div className="mb-6"><Link to="/sprzedawca/oferty" className="text-sm underline" style={{color:"var(--mut)"}}>← Moje oferty</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-semibold">Ustawienia bookingu</h1>{cat?.config&&<span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:active?"rgba(122,184,154,.14)":"rgba(200,150,90,.14)",color:active?"var(--green)":"var(--gold)"}}>{active?"● Aktywny":"○ Do konfiguracji"}</span>}</div><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{isDaily?"Rezerwacja pobytu lub wynajmu jak Booking.com.":"Rezerwacja usług jak Booksy."}</p></div>
  {isNew&&!active&&cat?.config&&<div className="mb-5 rounded-2xl p-4" style={{background:"rgba(56,224,240,.08)",border:"1px solid rgba(56,224,240,.20)"}}><b>Oferta utworzona. Teraz ustaw booking.</b><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Klienci nie zobaczą aktywnego kalendarza, dopóki nie zapiszesz ustawień i nie klikniesz „Aktywuj booking”.</p></div>}
  {msg&&<div className="mb-4 rounded-xl p-3 text-sm" style={{background:"rgba(200,150,90,.12)",color:"var(--gold)"}}>{msg}</div>}
  {!cat?.config?<Card><h2 className="text-xl font-semibold">Najpierw włącz booking</h2><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>W edycji oferty wybierz booking godzinowy albo wynajem na dni.</p></Card>:<>
   <div className="mb-5 rounded-2xl p-5" style={{background:"var(--glass)",border:active?"1px solid rgba(122,184,154,.35)":"1px solid rgba(200,150,90,.35)"}}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Publikacja kalendarza</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{active?"Booking jest publiczny i przyjmuje płatne rezerwacje.":"Booking jest roboczy. Najpierw skonfiguruj poniższe ustawienia."}</p></div><button disabled={busy} onClick={()=>setBookingActive(!active)} className="rounded-xl px-5 py-3 font-semibold text-black disabled:opacity-50" style={{background:active?"#d1d5db":"linear-gradient(135deg,#C8965A,#E8C896)"}}>{active?"Wyłącz booking":"Aktywuj booking"}</button></div></div>
   <div className="grid gap-5 lg:grid-cols-2">
    <Card><h2 className="text-xl font-semibold">Podstawy rezerwacji</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{isDaily&&<><label className="text-sm">Minimalna liczba dni<input type="number" min="1" className={`${input} mt-1`} style={style} value={extras.minUnits} onChange={e=>setExtras({...extras,minUnits:Number(e.target.value)})}/></label><label className="text-sm">Maksymalna liczba dni<input type="number" min="1" className={`${input} mt-1`} style={style} value={extras.maxUnits} onChange={e=>setExtras({...extras,maxUnits:Number(e.target.value)})}/></label><label className="text-sm">Opłata przygotowawcza / sprzątanie<input type="number" min="0" className={`${input} mt-1`} style={style} value={extras.cleaning} onChange={e=>setExtras({...extras,cleaning:Number(e.target.value)})}/></label></>}{isCarRental&&<label className="text-sm">Kaucja za wynajem auta<input type="number" min="0" className={`${input} mt-1`} style={style} value={extras.deposit} onChange={e=>setExtras({...extras,deposit:Number(e.target.value)})}/><span className="mt-1 block text-xs" style={{color:"var(--mut)"}}>Opcjonalna. Nie jest używana przy usługach ani noclegach.</span></label>}</div><label className="mt-4 flex items-center justify-between rounded-xl p-3" style={{border:"1px solid var(--line)"}}><span><b>Rezerwacja natychmiastowa</b><span className="block text-xs" style={{color:"var(--mut)"}}>Po skutecznej płatności termin jest potwierdzony automatycznie.</span></span><input type="checkbox" checked={extras.instant} onChange={e=>setExtras({...extras,instant:e.target.checked})}/></label><button disabled={busy} onClick={()=>call("seller_booking_save_extras",{p_offer:offerId,p_min_units:extras.minUnits,p_max_units:extras.maxUnits,p_cleaning_fee:isDaily?extras.cleaning:0,p_deposit:isCarRental?extras.deposit:0,p_instant:extras.instant})} className="mt-4 w-full rounded-xl py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zapisz ustawienia</button></Card>

    {!isDaily&&<Card><h2 className="text-xl font-semibold">Dostępność tygodniowa</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Klient zobaczy wyłącznie terminy mieszczące się w tych godzinach.</p><div className="mt-4 flex flex-wrap gap-2">{weekdays.map((d,i)=><button key={d} type="button" onClick={()=>addWindow(i)} className="rounded-lg px-2 py-1 text-xs" style={{border:"1px solid var(--line)"}}>+ {d}</button>)}</div><div className="mt-4 space-y-2">{windows.map((w,i)=><div key={`${w.weekday}-${i}`} className="grid grid-cols-[38px_1fr_1fr_28px] items-center gap-2 text-xs"><b>{weekdays[w.weekday]}</b><input type="time" className={input} style={style} value={w.starts_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,starts_at:e.target.value}:x))}/><input type="time" className={input} style={style} value={w.ends_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,ends_at:e.target.value}:x))}/><button onClick={()=>setWindows(p=>p.filter((_,j)=>j!==i))}>×</button></div>)}</div>{windows.length===0&&<div className="mt-4 rounded-xl p-3 text-sm" style={{background:"rgba(200,150,90,.08)",color:"var(--mut)"}}>Dodaj przynajmniej jeden dzień, np. Pn 08:00–18:00.</div>}<button disabled={busy||windows.length===0} onClick={saveAvailability} className="mt-4 w-full rounded-xl py-3 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>Zapisz dostępność</button></Card>}

    {!isDaily&&<Card><h2 className="text-xl font-semibold">Usługi</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Każda usługa może mieć własną cenę i czas trwania — jak w Booksy.</p><div className="mt-4 space-y-2">{cat.services.map(s=><div key={s.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{s.name}</b><div className="text-xs" style={{color:"var(--mut)"}}>{s.duration_minutes} min · {Number(s.price_gross).toLocaleString("pl-PL")} zł</div></div><button onClick={()=>call("seller_booking_service_delete",{p_offer:offerId,p_id:s.id})}>Usuń</button></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className={input} style={style} placeholder="Nazwa usługi" value={service.name} onChange={e=>setService({...service,name:e.target.value})}/><input type="number" className={input} style={style} placeholder="Cena" value={service.price||""} onChange={e=>setService({...service,price:Number(e.target.value)})}/><input type="number" className={input} style={style} placeholder="Czas w minutach" value={service.duration} onChange={e=>setService({...service,duration:Number(e.target.value)})}/><input className={input} style={style} placeholder="Krótki opis" value={service.description} onChange={e=>setService({...service,description:e.target.value})}/></div><button disabled={busy||!service.name} onClick={async()=>{if(await call("seller_booking_service_upsert",{p_offer:offerId,p_id:null,p_name:service.name,p_description:service.description,p_duration:service.duration,p_price:service.price,p_before:service.before,p_after:service.after,p_active:true}))setService({name:"",description:"",duration:60,price:0,before:0,after:0})}} className="mt-3 w-full rounded-xl py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj usługę</button></Card>}

    {!isDaily&&cat.services.length>0&&<ServiceResourceAssignments offerId={offerId} services={cat.services} resources={cat.resources} mappings={cat.service_resources||[]} onSaved={load}/>} 

    <Card><h2 className="text-xl font-semibold">{isDaily?"Flota / obiekty / sprzęt":"Pracownicy i zasoby"}</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{isDaily?"Dodaj jeden egzemplarz albo całą flotę naraz. Każde auto, apartament, pokój lub urządzenie ma własną dostępność i może być rezerwowane niezależnie.":"Pracownik lub sprzęt przypisywany do terminu usługi."}</p>{isDaily&&<div className="mt-3 rounded-xl p-3 text-xs leading-5" style={{background:"rgba(122,184,154,.08)",border:"1px solid rgba(122,184,154,.20)",color:"var(--mut)"}}>Przykład: wpisz <b>Toyota Yaris</b> i liczbę <b>5</b>. System utworzy Toyota Yaris 1–5 i podczas rezerwacji automatycznie przydzieli klientowi konkretny wolny egzemplarz.</div>}<div className="mt-4 space-y-2">{cat.resources.map(r=><div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{r.name}</b><div className="text-xs" style={{color:"var(--mut)"}}>{r.kind}</div></div><button onClick={()=>call("seller_booking_resource_unlink",{p_offer:offerId,p_id:r.id})}>Odłącz</button></div>)}</div><div className={`mt-4 grid gap-2 ${isDaily?"sm:grid-cols-[1fr_180px_120px]":"sm:grid-cols-2"}`}><input className={input} style={style} placeholder={isDaily?"Nazwa, np. Toyota Yaris":"Nazwa"} value={resource.name} onChange={e=>setResource({...resource,name:e.target.value})}/><select className={input} style={style} value={isDaily&&resource.kind==="staff"?"equipment":resource.kind} onChange={e=>setResource({...resource,kind:e.target.value})}>{!isDaily&&<option value="staff">Pracownik</option>}<option value="vehicle">Samochód</option><option value="property">Nieruchomość</option><option value="room">Pokój</option><option value="equipment">Sprzęt</option><option value="other">Inne</option></select>{isDaily&&<label className="text-xs" style={{color:"var(--mut)"}}><span className="mb-1 block">Liczba sztuk</span><input type="number" min="1" max="50" className={input} style={style} value={resourceCount} onChange={e=>setResourceCount(Math.max(1,Math.min(50,Number(e.target.value)||1)))}/></label>}</div>{isDaily&&resourceCount>1&&<div className="mt-2 text-xs" style={{color:"var(--mut)"}}>Utworzysz {resourceCount} niezależnych egzemplarzy: {resource.name.trim()||"Nazwa"} 1–{resourceCount}.</div>}<button disabled={busy||!resource.name.trim()} onClick={addResources} className="mt-3 w-full rounded-xl py-2.5 font-semibold disabled:opacity-50" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>{busy?"Dodaję…":isDaily&&resourceCount>1?`+ Dodaj ${resourceCount} egzemplarzy`:"+ Dodaj zasób"}</button></Card>

    {isDaily&&<Card><h2 className="text-xl font-semibold">Ceny sezonowe</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Weekend, święta, wakacje, sezon wysoki — cena może zmieniać się zależnie od daty.</p><div className="mt-4 space-y-2">{cat.rates.map(r=><div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{r.label||"Stawka specjalna"}</b><div className="text-xs" style={{color:"var(--mut)"}}>{r.starts_on} → {r.ends_on} · {r.price_per_unit?`${Number(r.price_per_unit).toLocaleString("pl-PL")} zł/dzień`:"cena bazowa"}</div></div><button onClick={()=>call("seller_booking_rate_delete",{p_offer:offerId,p_id:r.id})}>Usuń</button></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><input type="date" className={input} style={style} value={rate.from} onChange={e=>setRate({...rate,from:e.target.value})}/><input type="date" className={input} style={style} value={rate.to} onChange={e=>setRate({...rate,to:e.target.value})}/><input type="number" className={input} style={style} placeholder="Cena za dzień" value={rate.price||""} onChange={e=>setRate({...rate,price:Number(e.target.value)})}/><input className={input} style={style} placeholder="Nazwa, np. Wakacje" value={rate.label} onChange={e=>setRate({...rate,label:e.target.value})}/></div><button disabled={busy||!rate.from||!rate.to} onClick={async()=>{if(await call("seller_booking_rate_upsert",{p_offer:offerId,p_id:null,p_from:rate.from,p_to:rate.to,p_price:rate.price||null,p_min_units:rate.minUnits||null,p_label:rate.label,p_priority:0,p_active:true}))setRate({from:"",to:"",price:0,minUnits:1,label:""})}} className="mt-3 w-full rounded-xl py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj stawkę</button></Card>}
   </div>
  </>}
 </Shell>
}
function Card({children}:{children:React.ReactNode}){return <section className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>{children}</section>}
function Shell({children}:{children:React.ReactNode}){return <main className="min-h-screen px-4 py-8" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-6xl">{children}</div></main>}
