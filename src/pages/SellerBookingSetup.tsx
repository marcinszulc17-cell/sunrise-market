import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { configureBookingOffer, replaceBookingAvailability, type BookingWindow } from "../lib/api";
import ServiceResourceAssignments from "../components/ServiceResourceAssignments";
import { supabase } from "../lib/supabase";

const input="w-full rounded-xl px-3 py-2.5 outline-none";
const style:React.CSSProperties={background:"var(--glass)",border:"1px solid var(--line)",color:"var(--ink)"};
const weekdays=["Nd","Pn","Wt","Śr","Cz","Pt","Sb"];
// Udogodnienia noclegowe — te same slugi trafiają do offers.attributes.amenities i filtrów w search_stays.
const AMENITIES=[
 {id:"wifi",icon:"📶",label:"Wi-Fi"},
 {id:"parking",icon:"🅿️",label:"Parking"},
 {id:"sniadanie",icon:"🥐",label:"Śniadanie"},
 {id:"kuchnia",icon:"🍳",label:"Kuchnia"},
 {id:"klimatyzacja",icon:"❄️",label:"Klimatyzacja"},
 {id:"pralka",icon:"🧺",label:"Pralka"},
 {id:"basen",icon:"🏊",label:"Basen"},
 {id:"sauna",icon:"🧖",label:"Sauna"},
 {id:"zwierzeta",icon:"🐾",label:"Zwierzęta OK"},
 {id:"taras",icon:"🌿",label:"Taras / ogród"},
 {id:"kominek",icon:"🔥",label:"Kominek"},
 {id:"winda",icon:"🛗",label:"Winda"},
];
type Cat={offer?:{category_slug?:string;offer_type?:string};config:any;services:any[];resources:any[];service_resources:{service_id:string;resource_id:string}[];rates:any[]};

export default function SellerBookingSetup(){
 const {offerId}=useParams(); const [sp]=useSearchParams(); const isNew=sp.get("new")==="1";
 const [cat,setCat]=useState<Cat|null>(null); const [msg,setMsg]=useState(""); const [busy,setBusy]=useState(false);
 const [service,setService]=useState({name:"",description:"",duration:60,price:0,before:0,after:0});
 const [resource,setResource]=useState({name:"",kind:"staff",description:""});
 const [resourceCount,setResourceCount]=useState(1);
 const [rate,setRate]=useState({from:"",to:"",price:0,minUnits:1,label:""});
 // Rabaty za długość najmu (do 50%): [{min_days, pct}] → market.set_booking_length_discounts
 const [discounts,setDiscounts]=useState<Array<{min_days:number;pct:number}>>([]);
 const [discountDraft,setDiscountDraft]=useState({min_days:4,pct:5});
 const [extras,setExtras]=useState({minUnits:1,maxUnits:30,cleaning:0,deposit:0,instant:true});
 // Nocleg: pojemność, doba hotelowa i udogodnienia (decyzja właściciela 2026-09-10 — „ma być jak na Booking").
 // Nocleg — komplet danych, których gość szuka na Bookingu: pojemność, doba hotelowa,
 // struktura (sypialnie, łazienki, łóżka, metraż), zasady pobytu i odbiór kluczy.
 type Stay={guests:number;checkin:string;checkout:string;amenities:string[];
  bedrooms:number;bathrooms:number;area:number;bedDouble:number;bedSingle:number;bedSofa:number;
  quietFrom:string;quietTo:string;smoking:boolean;parties:boolean;children:boolean;pets:boolean;
  keys:string;rules:string};
 const [stay,setStay]=useState<Stay>({guests:2,checkin:"15:00",checkout:"11:00",amenities:[],
  bedrooms:1,bathrooms:1,area:0,bedDouble:1,bedSingle:0,bedSofa:0,
  quietFrom:"22:00",quietTo:"07:00",smoking:false,parties:false,children:true,pets:false,
  keys:"",rules:""});
 // Sposób wyceny: za cały obiekt czy za osobę. Część obiektów (pokoje gościnne,
 // agroturystyka) liczy od osoby i bez tego nie da się ich uczciwie wystawić.
 const [priceMode,setPriceMode]=useState<"per_night"|"per_person">("per_night");
 // Polityka anulowania decyduje o kwocie zwrotu dla gościa — jest wpięta w zwroty,
 // nie jest samym opisem. Gość widzi ją przed płatnością.
 const [cancelPolicy,setCancelPolicy]=useState<"flexible"|"moderate"|"strict"|"non_refundable">("moderate");
 // Opłaty pobytowe wchodzą do kwoty płaconej przez gościa — nie są opisem.
 const [stayFees,setStayFees]=useState({cityTax:0,petFee:0,baseGuests:0,extraPerson:0});
 // Gotowość oferty przed publikacją — twarde są zdjęcia i opis, reszta to podpowiedzi.
 type Readiness={photos:number;photos_ok:boolean;description_len:number;description_ok:boolean;location_ok:boolean;price_ok:boolean;capacity_ok:boolean;amenities:number;amenities_ok:boolean;checkin_ok:boolean;structure_ok:boolean;ready:boolean};
 const [readiness,setReadiness]=useState<Readiness|null>(null);
 // Współrzędne podaje właściciel (kopiuje z map) — nie zgadujemy położenia obiektu.
 const [geo,setGeo]=useState({lat:"",lng:"",directions:""});
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
   setDiscounts(Array.isArray((c.config as any).length_discounts)?(c.config as any).length_discounts:[]);
  }
  if(String(c?.offer?.category_slug||"").startsWith("noclegi")){
   const {data:rd}=await supabase.schema("market").rpc("stay_readiness",{p_offer:offerId});
   setReadiness((((rd as Readiness[])??[])[0])??null);
   const {data:st}=await supabase.schema("market").rpc("seller_stay_settings",{p_offer:offerId});
   const row=(st??null) as Record<string,any>|null;
   if(row){
    const beds=(row.beds??{}) as Record<string,number>;
    setStay(prev=>({...prev,
     guests:Number(row.max_guests||2),
     checkin:String(row.checkin_from||"15:00").slice(0,5),
     checkout:String(row.checkout_until||"11:00").slice(0,5),
     amenities:Array.isArray(row.amenities)?row.amenities:[],
     bedrooms:Number(row.bedrooms??1),
     bathrooms:Number(row.bathrooms??1),
     area:Number(row.area_m2??0),
     bedDouble:Number(beds.double??0),
     bedSingle:Number(beds.single??0),
     bedSofa:Number(beds.sofa??0),
     quietFrom:row.quiet_hours_from?String(row.quiet_hours_from).slice(0,5):"22:00",
     quietTo:row.quiet_hours_to?String(row.quiet_hours_to).slice(0,5):"07:00",
     smoking:Boolean(row.smoking_allowed),
     parties:Boolean(row.parties_allowed),
     children:row.children_allowed===null||row.children_allowed===undefined?true:Boolean(row.children_allowed),
     pets:Boolean(row.pets_allowed),
     keys:String(row.checkin_instructions??""),
     rules:String(row.house_rules_extra??""),
    }));
    setPriceMode(row.price_mode==="per_person"?"per_person":"per_night");
    if(["flexible","moderate","strict","non_refundable"].includes(String(row.cancellation_policy)))setCancelPolicy(row.cancellation_policy);
    setGeo({
     lat:row.latitude!=null?String(row.latitude):"",
     lng:row.longitude!=null?String(row.longitude):"",
     directions:String(row.directions??""),
    });
    setStayFees({
     cityTax:Number(row.city_tax_per_person_night||0),
     petFee:Number(row.pet_fee_per_night||0),
     baseGuests:Number(row.base_guests||0),
     extraPerson:Number(row.extra_person_fee_per_night||0),
    });
   }
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
 const isDaily=cat?.config?.booking_type==="daily";
 const slug=String(cat?.offer?.category_slug||"");
 const offerType=String(cat?.offer?.offer_type||"");
 const isCarRental=isDaily&&(slug.startsWith("motoryzacja-")||offerType==="car_rental");
 const isEquipmentRental=isDaily&&(offerType==="product_rental"||offerType==="equipment_rental"||Boolean(cat?.resources?.some(r=>r.kind==="equipment")));
 // Nocleg to wynajem krotkoterminowy — kaucja jest tu standardem tak samo jak przy aucie czy sprzecie.
 const isStay=isDaily&&slug.startsWith("noclegi");
 const depositAllowed=isCarRental||isEquipmentRental||isStay;
 return <Shell>
  <div className="mb-6"><Link to="/sprzedawca/oferty" className="text-sm underline" style={{color:"var(--mut)"}}>← Moje oferty</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-semibold">Ustawienia bookingu</h1>{cat?.config&&<span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:active?"rgba(122,184,154,.14)":"rgba(232,137,26,.14)",color:active?"var(--green)":"var(--gold)"}}>{active?"● Aktywny":"○ Do konfiguracji"}</span>}</div><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{isDaily?"Wynajem online: cena za dobę, wybór dat od–do i płatność za cały okres.":"Rezerwacja usług jak Booksy."}</p></div>
  {isNew&&!active&&cat?.config&&<div className="mb-5 rounded-2xl p-4" style={{background:"rgba(56,224,240,.08)",border:"1px solid rgba(56,224,240,.20)"}}><b>Oferta utworzona. Teraz ustaw booking.</b><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Klienci nie zobaczą aktywnego kalendarza, dopóki nie zapiszesz ustawień i nie klikniesz „Aktywuj booking”.</p></div>}
  {msg&&<div className="mb-4 rounded-xl p-3 text-sm" style={{background:"rgba(232,137,26,.12)",color:"var(--gold)"}}>{msg}</div>}
  {!cat?.config?<Card><h2 className="text-xl font-semibold">Najpierw włącz booking</h2><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>W edycji oferty wybierz booking godzinowy albo wynajem na dni.</p></Card>:<>
   {isStay&&readiness&&<div className="mb-5 rounded-2xl p-5" style={{background:"var(--glass)",border:readiness.ready?"1px solid rgba(122,184,154,.35)":"1px solid rgba(232,137,26,.35)"}}>
    <h2 className="text-xl font-semibold">Gotowość oferty</h2>
    <p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Dwa pierwsze punkty są wymagane do publikacji. Reszta nie blokuje, ale bez nich gość częściej wybiera inny obiekt.</p>
    <ul className="mt-3 grid gap-1.5 text-sm">
     {([[readiness.photos_ok,`Zdjęcia: ${readiness.photos} z minimum 5`,true],
        [readiness.description_ok,`Opis: ${readiness.description_len} z minimum 200 znaków`,true],
        [readiness.price_ok,"Cena za dobę ustawiona",false],
        [readiness.capacity_ok,"Maksymalna liczba gości",false],
        [readiness.structure_ok,"Sypialnie i łóżka",false],
        [readiness.checkin_ok,"Godziny zameldowania i wymeldowania",false],
        [readiness.amenities_ok,`Udogodnienia: ${readiness.amenities} z sugerowanych 3`,false],
        [readiness.location_ok,"Lokalizacja w ofercie",false]] as [boolean,string,boolean][]).map(([ok,label,required])=>(
      <li key={label} className="flex items-center gap-2">
       <span style={{color:ok?"var(--green)":required?"#F25CB0":"var(--mut)"}}>{ok?"✓":"○"}</span>
       <span style={{color:ok?"var(--ink)":"var(--mut)"}}>{label}{required&&!ok?" — wymagane":""}</span>
      </li>))}
    </ul>
    {!readiness.ready&&<p className="mt-3 text-xs" style={{color:"var(--mut)"}}>Zdjęcia i opis dodajesz w <a href={`/sprzedawca/oferty/${offerId}/edytuj`} className="underline" style={{color:"var(--gold)"}}>edycji oferty</a>.</p>}
   </div>}

   <div className="mb-5 rounded-2xl p-5" style={{background:"var(--glass)",border:active?"1px solid rgba(122,184,154,.35)":"1px solid rgba(232,137,26,.35)"}}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Publikacja kalendarza</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{active?"Booking jest publiczny i przyjmuje płatne rezerwacje.":"Booking jest roboczy. Najpierw skonfiguruj poniższe ustawienia."}</p></div><button disabled={busy} onClick={()=>setBookingActive(!active)} className="rounded-xl px-5 py-3 font-semibold text-black disabled:opacity-50" style={{background:active?"#d1d5db":"linear-gradient(135deg,#E8891A,#F5A623)"}}>{active?"Wyłącz booking":"Aktywuj booking"}</button></div></div>
   <div className="grid gap-5 lg:grid-cols-2">
    <Card><h2 className="text-xl font-semibold">Podstawy rezerwacji</h2>{isDaily&&<div className="mt-3 rounded-xl p-3 text-sm" style={{background:"rgba(56,224,240,.07)",border:"1px solid rgba(56,224,240,.18)"}}><span style={{color:"var(--mut)"}}>Cena bazowa</span><div className="mt-1 text-xl font-semibold">{Number(cat.config.price_per_unit||0).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})} zł / {isStay&&priceMode==="per_person"?"osobę za dobę":"dobę"}</div></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{isDaily&&<><label className="text-sm">Minimalna liczba dni<input type="number" min="1" className={`${input} mt-1`} style={style} value={extras.minUnits} onChange={e=>setExtras({...extras,minUnits:Number(e.target.value)})}/></label><label className="text-sm">Maksymalna liczba dni<input type="number" min="1" className={`${input} mt-1`} style={style} value={extras.maxUnits} onChange={e=>setExtras({...extras,maxUnits:Number(e.target.value)})}/></label><label className="text-sm">Opłata dodatkowa / sprzątanie<input type="number" min="0" className={`${input} mt-1`} style={style} value={extras.cleaning} onChange={e=>setExtras({...extras,cleaning:Number(e.target.value)})}/></label></>}{depositAllowed&&<label className="text-sm">Kaucja zabezpieczająca<input type="number" min="0" className={`${input} mt-1`} style={style} value={extras.deposit} onChange={e=>setExtras({...extras,deposit:Number(e.target.value)})}/><span className="mt-1 block text-xs" style={{color:"var(--mut)"}}>{isCarRental?"Opcjonalna kaucja za wynajem auta.":isStay?"Opcjonalna kaucja za pobyt — zabezpiecza obiekt przed zniszczeniami.":"Opcjonalna kaucja za wynajem sprzętu."} Klient płaci ją razem z czynszem, ale jest rozliczana osobno po zakończeniu najmu.</span></label>}</div><label className="mt-4 flex items-center justify-between rounded-xl p-3" style={{border:"1px solid var(--line)"}}><span><b>Rezerwacja natychmiastowa</b><span className="block text-xs" style={{color:"var(--mut)"}}>Po skutecznej płatności termin jest potwierdzony automatycznie.</span></span><input type="checkbox" checked={extras.instant} onChange={e=>setExtras({...extras,instant:e.target.checked})}/></label><button disabled={busy} onClick={()=>call("seller_booking_save_extras",{p_offer:offerId,p_min_units:extras.minUnits,p_max_units:extras.maxUnits,p_cleaning_fee:isDaily?extras.cleaning:0,p_deposit:depositAllowed?extras.deposit:0,p_instant:extras.instant})} className="mt-4 w-full rounded-xl py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Zapisz ustawienia</button></Card>

    {!isDaily&&<Card><h2 className="text-xl font-semibold">Dostępność tygodniowa</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Klient zobaczy wyłącznie terminy mieszczące się w tych godzinach.</p><div className="mt-4 flex flex-wrap gap-2">{weekdays.map((d,i)=><button key={d} type="button" onClick={()=>addWindow(i)} className="rounded-lg px-2 py-1 text-xs" style={{border:"1px solid var(--line)"}}>+ {d}</button>)}</div><div className="mt-4 space-y-2">{windows.map((w,i)=><div key={`${w.weekday}-${i}`} className="grid grid-cols-[38px_1fr_1fr_28px] items-center gap-2 text-xs"><b>{weekdays[w.weekday]}</b><input type="time" className={input} style={style} value={w.starts_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,starts_at:e.target.value}:x))}/><input type="time" className={input} style={style} value={w.ends_at} onChange={e=>setWindows(p=>p.map((x,j)=>j===i?{...x,ends_at:e.target.value}:x))}/><button onClick={()=>setWindows(p=>p.filter((_,j)=>j!==i))}>×</button></div>)}</div>{windows.length===0&&<div className="mt-4 rounded-xl p-3 text-sm" style={{background:"rgba(232,137,26,.08)",color:"var(--mut)"}}>Dodaj przynajmniej jeden dzień, np. Pn 08:00–18:00.</div>}<button disabled={busy||windows.length===0} onClick={saveAvailability} className="mt-4 w-full rounded-xl py-3 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>Zapisz dostępność</button></Card>}

    {!isDaily&&<Card><h2 className="text-xl font-semibold">Usługi</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Każda usługa może mieć własną cenę i czas trwania — jak w Booksy.</p><div className="mt-4 space-y-2">{cat.services.map(s=><div key={s.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{s.name}</b><div className="text-xs" style={{color:"var(--mut)"}}>{s.duration_minutes} min · {Number(s.price_gross).toLocaleString("pl-PL")} zł</div></div><button onClick={()=>call("seller_booking_service_delete",{p_offer:offerId,p_id:s.id})}>Usuń</button></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><input className={input} style={style} placeholder="Nazwa usługi" value={service.name} onChange={e=>setService({...service,name:e.target.value})}/><input type="number" className={input} style={style} placeholder="Cena" value={service.price||""} onChange={e=>setService({...service,price:Number(e.target.value)})}/><input type="number" className={input} style={style} placeholder="Czas w minutach" value={service.duration} onChange={e=>setService({...service,duration:Number(e.target.value)})}/><input className={input} style={style} placeholder="Krótki opis" value={service.description} onChange={e=>setService({...service,description:e.target.value})}/></div><button disabled={busy||!service.name} onClick={async()=>{if(await call("seller_booking_service_upsert",{p_offer:offerId,p_id:null,p_name:service.name,p_description:service.description,p_duration:service.duration,p_price:service.price,p_before:service.before,p_after:service.after,p_active:true}))setService({name:"",description:"",duration:60,price:0,before:0,after:0})}} className="mt-3 w-full rounded-xl py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj usługę</button></Card>}

    {!isDaily&&cat.services.length>0&&<ServiceResourceAssignments offerId={offerId} services={cat.services} resources={cat.resources} mappings={cat.service_resources||[]} onSaved={load}/>} 

    <Card><h2 className="text-xl font-semibold">{isDaily?"Flota / obiekty / sprzęt":"Pracownicy i zasoby"}</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{isDaily?"Dodaj jeden egzemplarz albo całą flotę naraz. Każde auto, apartament, pokój lub urządzenie ma własną dostępność i może być rezerwowane niezależnie.":"Pracownik lub sprzęt przypisywany do terminu usługi."}</p>{isDaily&&<div className="mt-3 rounded-xl p-3 text-xs leading-5" style={{background:"rgba(122,184,154,.08)",border:"1px solid rgba(122,184,154,.20)",color:"var(--mut)"}}>Przykład: wpisz <b>Toyota Yaris</b> i liczbę <b>5</b>. System utworzy Toyota Yaris 1–5 i podczas rezerwacji automatycznie przydzieli klientowi konkretny wolny egzemplarz.</div>}<div className="mt-4 space-y-2">{cat.resources.map(r=><div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{r.name}</b><div className="text-xs" style={{color:"var(--mut)"}}>{r.kind}</div></div><button onClick={()=>call("seller_booking_resource_unlink",{p_offer:offerId,p_id:r.id})}>Odłącz</button></div>)}</div><div className={`mt-4 grid gap-2 ${isDaily?"sm:grid-cols-[1fr_180px_120px]":"sm:grid-cols-2"}`}><input className={input} style={style} placeholder={isDaily?"Nazwa, np. Toyota Yaris":"Nazwa"} value={resource.name} onChange={e=>setResource({...resource,name:e.target.value})}/><select className={input} style={style} value={isDaily&&resource.kind==="staff"?"equipment":resource.kind} onChange={e=>setResource({...resource,kind:e.target.value})}>{!isDaily&&<option value="staff">Pracownik</option>}<option value="vehicle">Samochód</option><option value="property">Nieruchomość</option><option value="room">Pokój</option><option value="equipment">Sprzęt</option><option value="other">Inne</option></select>{isDaily&&<label className="text-xs" style={{color:"var(--mut)"}}><span className="mb-1 block">Liczba sztuk</span><input type="number" min="1" max="50" className={input} style={style} value={resourceCount} onChange={e=>setResourceCount(Math.max(1,Math.min(50,Number(e.target.value)||1)))}/></label>}</div>{isDaily&&resourceCount>1&&<div className="mt-2 text-xs" style={{color:"var(--mut)"}}>Utworzysz {resourceCount} niezależnych egzemplarzy: {resource.name.trim()||"Nazwa"} 1–{resourceCount}.</div>}<button disabled={busy||!resource.name.trim()} onClick={addResources} className="mt-3 w-full rounded-xl py-2.5 font-semibold disabled:opacity-50" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>{busy?"Dodaję…":isDaily&&resourceCount>1?`+ Dodaj ${resourceCount} egzemplarzy`:"+ Dodaj zasób"}</button></Card>

    {isDaily&&<Card><h2 className="text-xl font-semibold">Rabaty za dłuższy najem</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Im dłużej, tym taniej — rabat liczony od czynszu za cały okres (nie od kaucji). Klient widzi progi przy wyborze dat.</p><div className="mt-4 space-y-2">{discounts.map((d,i)=><div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>od {d.min_days} dni</b> · −{d.pct}%</div><button onClick={async()=>{const next=discounts.filter((_,j)=>j!==i);if(await call("set_booking_length_discounts",{p_offer:offerId,p_discounts:next}))setDiscounts(next);}}>Usuń</button></div>)}{!discounts.length&&<div className="text-xs" style={{color:"var(--mut)"}}>Brak rabatów.</div>}</div><div className="mt-4 grid grid-cols-2 gap-2"><input type="number" min={2} className={input} style={style} placeholder="od ilu dni" value={discountDraft.min_days||""} onChange={e=>setDiscountDraft({...discountDraft,min_days:Number(e.target.value)})}/><input type="number" min={1} max={50} className={input} style={style} placeholder="rabat %" value={discountDraft.pct||""} onChange={e=>setDiscountDraft({...discountDraft,pct:Number(e.target.value)})}/></div><button disabled={busy||discountDraft.min_days<2||discountDraft.pct<=0} onClick={async()=>{const next=[...discounts.filter(d=>d.min_days!==discountDraft.min_days),{min_days:discountDraft.min_days,pct:discountDraft.pct}].sort((a,b)=>a.min_days-b.min_days);if(await call("set_booking_length_discounts",{p_offer:offerId,p_discounts:next}))setDiscounts(next);}} className="mt-3 w-full rounded-xl py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj próg rabatu</button></Card>}
    {isStay&&<Card><h2 className="text-xl font-semibold">Nocleg</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Te dane decydują, czy obiekt pokaże się w wyszukiwarce noclegów przy zapytaniu „dokąd, termin, liczba osób”.</p>
     <div className="mt-4 text-sm font-semibold">Jak wyceniasz pobyt</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Cena bazowa i ceny sezonowe zostają te same — zmienia się tylko to, czy mnożymy je przez liczbę gości.</p>
     <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {([["per_night","Za dobę (cały obiekt)","Domek, apartament, całe mieszkanie — cena nie zależy od liczby osób."],["per_person","Za osobę za dobę","Pokój gościnny, agroturystyka, hostel — cena mnożona przez liczbę gości."]] as const).map(([id,t,d])=>(
       <button type="button" key={id} onClick={async()=>{if(await call("seller_booking_set_price_mode",{p_offer:offerId,p_mode:id}))setPriceMode(id)}} className="rounded-xl p-3 text-left" style={priceMode===id?{border:"1px solid var(--gold)",background:"rgba(245,166,35,.10)"}:{border:"1px solid var(--line)"}}>
        <div className="text-sm font-semibold">{t}</div>
        <div className="mt-0.5 text-xs" style={{color:"var(--mut)"}}>{d}</div>
       </button>
      ))}
     </div>

     <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Maksymalnie gości<input type="number" min="1" max="50" className={`${input} mt-1`} style={style} value={stay.guests} onChange={e=>setStay({...stay,guests:Number(e.target.value)})}/></label>
      <label className="text-sm">Doba hotelowa od<input type="time" className={`${input} mt-1`} style={style} value={stay.checkin} onChange={e=>setStay({...stay,checkin:e.target.value})}/></label>
      <label className="text-sm">Doba hotelowa do<input type="time" className={`${input} mt-1`} style={style} value={stay.checkout} onChange={e=>setStay({...stay,checkout:e.target.value})}/></label>
     </div>
     <div className="mt-4 text-sm font-semibold">Udogodnienia</div>
     <div className="mt-2 flex flex-wrap gap-2">{AMENITIES.map(a=>{const on=stay.amenities.includes(a.id);return <button type="button" key={a.id} onClick={()=>setStay({...stay,amenities:on?stay.amenities.filter(x=>x!==a.id):[...stay.amenities,a.id]})} className="min-h-[40px] rounded-full px-3 py-2 text-sm" style={on?{background:"rgba(245,166,35,.14)",border:"1px solid var(--gold)",color:"var(--gold)"}:{background:"rgba(255,255,255,.04)",border:"1px solid var(--line)",color:"var(--ink)"}}>{a.icon} {a.label}</button>})}</div>
     <div className="mt-5 text-sm font-semibold">Co jest w środku</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Gość porównuje obiekty po liczbie sypialni i łóżek — bez tego trudno mu podjąć decyzję.</p>
     <div className="mt-3 grid gap-3 sm:grid-cols-4">
      <label className="text-sm">Sypialnie<input type="number" min="0" max="20" className={`${input} mt-1`} style={style} value={stay.bedrooms} onChange={e=>setStay({...stay,bedrooms:Number(e.target.value)})}/></label>
      <label className="text-sm">Łazienki<input type="number" min="0" max="20" className={`${input} mt-1`} style={style} value={stay.bathrooms} onChange={e=>setStay({...stay,bathrooms:Number(e.target.value)})}/></label>
      <label className="text-sm">Powierzchnia (m²)<input type="number" min="0" className={`${input} mt-1`} style={style} value={stay.area||""} onChange={e=>setStay({...stay,area:Number(e.target.value)})}/></label>
      <div className="text-sm">
       <span>Łóżka</span>
       <div className="mt-1 grid grid-cols-3 gap-1">
        <label className="text-[11px]" style={{color:"var(--mut)"}}>podwójne<input type="number" min="0" max="20" className={`${input} mt-0.5`} style={style} value={stay.bedDouble} onChange={e=>setStay({...stay,bedDouble:Number(e.target.value)})}/></label>
        <label className="text-[11px]" style={{color:"var(--mut)"}}>pojedyncze<input type="number" min="0" max="20" className={`${input} mt-0.5`} style={style} value={stay.bedSingle} onChange={e=>setStay({...stay,bedSingle:Number(e.target.value)})}/></label>
        <label className="text-[11px]" style={{color:"var(--mut)"}}>sofa<input type="number" min="0" max="20" className={`${input} mt-0.5`} style={style} value={stay.bedSofa} onChange={e=>setStay({...stay,bedSofa:Number(e.target.value)})}/></label>
       </div>
      </div>
     </div>

     <div className="mt-5 text-sm font-semibold">Zasady pobytu</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Zobaczy je gość przed rezerwacją. Jasne zasady to mniej sporów po pobycie.</p>
     <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Cisza nocna od<input type="time" className={`${input} mt-1`} style={style} value={stay.quietFrom} onChange={e=>setStay({...stay,quietFrom:e.target.value})}/></label>
      <label className="text-sm">Cisza nocna do<input type="time" className={`${input} mt-1`} style={style} value={stay.quietTo} onChange={e=>setStay({...stay,quietTo:e.target.value})}/></label>
     </div>
     <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {([["smoking","Palenie dozwolone"],["parties","Imprezy dozwolone"],["children","Dzieci mile widziane"],["pets","Zwierzęta dozwolone"]] as const).map(([key,label])=>(
       <label key={key} className="flex items-center justify-between rounded-xl p-3 text-sm" style={{border:"1px solid var(--line)"}}>
        <span>{label}</span>
        <input type="checkbox" checked={Boolean((stay as any)[key])} onChange={e=>setStay({...stay,[key]:e.target.checked} as Stay)}/>
       </label>
      ))}
     </div>
     <label className="mt-3 block text-sm">Odbiór kluczy / zameldowanie
      <textarea rows={2} className={`${input} mt-1`} style={style} placeholder="np. Skrzynka z kodem przy drzwiach, kod wysyłamy dzień przed przyjazdem." value={stay.keys} onChange={e=>setStay({...stay,keys:e.target.value})}/>
     </label>
     <label className="mt-3 block text-sm">Dodatkowe zasady
      <textarea rows={2} className={`${input} mt-1`} style={style} placeholder="np. Zakaz wnoszenia rowerów do domku. Segregacja odpadów." value={stay.rules} onChange={e=>setStay({...stay,rules:e.target.value})}/>
     </label>

     <div className="mt-5 text-sm font-semibold">Mapa i dojazd</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Pinezka pokazuje gościowi okolicę, nie konkretny budynek — dokładny adres dostaje w potwierdzeniu rezerwacji. Współrzędne skopiujesz z map: prawy przycisk na punkcie → kopiuj współrzędne.</p>
     <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Szerokość (lat)<input className={`${input} mt-1`} style={style} placeholder="52.31234" value={geo.lat} onChange={e=>setGeo({...geo,lat:e.target.value.replace(",",".")})}/></label>
      <label className="text-sm">Długość (lng)<input className={`${input} mt-1`} style={style} placeholder="16.12345" value={geo.lng} onChange={e=>setGeo({...geo,lng:e.target.value.replace(",",".")})}/></label>
     </div>
     <label className="mt-3 block text-sm">Jak dojechać
      <textarea rows={2} className={`${input} mt-1`} style={style} placeholder="np. Zjazd z drogi 92 na Sielinko, po 2 km w prawo w drogę leśną. Ostatnie 300 m to szuter — zimą lepiej autem z wyższym zawieszeniem." value={geo.directions} onChange={e=>setGeo({...geo,directions:e.target.value})}/>
     </label>
     <button disabled={busy} onClick={()=>call("seller_booking_set_location",{p_offer:offerId,p_lat:geo.lat.trim()?Number(geo.lat):null,p_lng:geo.lng.trim()?Number(geo.lng):null,p_directions:geo.directions||null})} className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>Zapisz lokalizację</button>

     <div className="mt-5 text-sm font-semibold">Opłaty doliczane do rezerwacji</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Gość widzi każdą z nich osobno przed płatnością i płaci je razem z czynszem. Zostaw 0, jeśli nie pobierasz.</p>
     <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Opłata miejscowa (zł za osobę za dobę)<input type="number" min="0" step="0.01" className={`${input} mt-1`} style={style} value={stayFees.cityTax||""} onChange={e=>setStayFees({...stayFees,cityTax:Number(e.target.value)})}/><span className="mt-1 block text-xs" style={{color:"var(--mut)"}}>Tyle, ile pobiera Twoja gmina. Nie wymyślaj kwoty — to danina publiczna.</span></label>
      <label className="text-sm">Opłata za zwierzę (zł za dobę)<input type="number" min="0" step="0.01" className={`${input} mt-1`} style={style} value={stayFees.petFee||""} onChange={e=>setStayFees({...stayFees,petFee:Number(e.target.value)})}/><span className="mt-1 block text-xs" style={{color:"var(--mut)"}}>Widoczna tylko wtedy, gdy zwierzęta są dozwolone.</span></label>
      {priceMode==="per_night"&&<>
       <label className="text-sm">Cena zawiera pobyt dla … osób<input type="number" min="0" max="30" className={`${input} mt-1`} style={style} value={stayFees.baseGuests||""} onChange={e=>setStayFees({...stayFees,baseGuests:Number(e.target.value)})}/></label>
       <label className="text-sm">Dopłata za każdą kolejną osobę (zł za dobę)<input type="number" min="0" step="0.01" className={`${input} mt-1`} style={style} value={stayFees.extraPerson||""} onChange={e=>setStayFees({...stayFees,extraPerson:Number(e.target.value)})}/></label>
      </>}
     </div>
     <button disabled={busy} onClick={()=>call("seller_booking_set_stay_fees",{p_offer:offerId,p_city_tax:stayFees.cityTax,p_pet_fee:stayFees.petFee,p_base_guests:priceMode==="per_night"?stayFees.baseGuests:null,p_extra_person:priceMode==="per_night"?stayFees.extraPerson:0})} className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>Zapisz opłaty</button>

     <div className="mt-5 text-sm font-semibold">Polityka anulowania</div>
     <p className="mt-1 text-xs" style={{color:"var(--mut)"}}>Gość widzi ją przed płatnością, a system sam wylicza z niej zwrot przy anulowaniu. Kaucja i opłata za sprzątanie wracają zawsze — pobyt się nie odbył.</p>
     <div className="mt-2 grid gap-2">
      {([["flexible","Elastyczna","Bezpłatne anulowanie do 1 dnia przed przyjazdem. Najwięcej rezerwacji, najwięcej odwołań."],
         ["moderate","Umiarkowana","Bezpłatnie do 7 dni przed, potem 50% czynszu. Rozsądny środek."],
         ["strict","Ścisła","Do 30 dni przed 50%, później 0%. Chroni sezon, ale część gości wybierze inny obiekt."],
         ["non_refundable","Bezzwrotna","Czynsz nie wraca. Stosuj tylko przy wyraźnie niższej cenie, inaczej odstraszasz."]] as const).map(([id,t,d])=>(
       <button type="button" key={id} onClick={async()=>{if(await call("seller_booking_set_cancellation_policy",{p_offer:offerId,p_policy:id}))setCancelPolicy(id)}} className="rounded-xl p-3 text-left" style={cancelPolicy===id?{border:"1px solid var(--gold)",background:"rgba(245,166,35,.10)"}:{border:"1px solid var(--line)"}}>
        <div className="text-sm font-semibold">{t}</div>
        <div className="mt-0.5 text-xs" style={{color:"var(--mut)"}}>{d}</div>
       </button>
      ))}
     </div>

     <button disabled={busy} onClick={()=>call("seller_booking_save_stay_v2",{
       p_offer:offerId,p_max_guests:stay.guests,p_checkin_from:stay.checkin||null,p_checkout_until:stay.checkout||null,
       p_amenities:stay.amenities,p_bedrooms:stay.bedrooms,p_bathrooms:stay.bathrooms,
       p_beds:{double:stay.bedDouble,single:stay.bedSingle,sofa:stay.bedSofa},
       p_area_m2:stay.area||null,p_quiet_from:stay.quietFrom||null,p_quiet_to:stay.quietTo||null,
       p_smoking:stay.smoking,p_parties:stay.parties,p_children:stay.children,p_pets:stay.pets,
       p_checkin_instructions:stay.keys||null,p_house_rules:stay.rules||null,
     })} className="mt-4 w-full rounded-xl py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Zapisz dane noclegu</button>
    </Card>}
    {isDaily&&<Card><h2 className="text-xl font-semibold">Ceny sezonowe</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Weekend, święta, wakacje, sezon wysoki — cena za dobę może zmieniać się zależnie od daty.</p><div className="mt-4 space-y-2">{cat.rates.map(r=><div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{border:"1px solid var(--line)"}}><div className="flex-1"><b>{r.label||"Stawka specjalna"}</b><div className="text-xs" style={{color:"var(--mut)"}}>{r.starts_on} → {r.ends_on} · {r.price_per_unit?`${Number(r.price_per_unit).toLocaleString("pl-PL")} zł/dobę`:"cena bazowa"}</div></div><button onClick={()=>call("seller_booking_rate_delete",{p_offer:offerId,p_id:r.id})}>Usuń</button></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><input type="date" className={input} style={style} value={rate.from} onChange={e=>setRate({...rate,from:e.target.value})}/><input type="date" className={input} style={style} value={rate.to} onChange={e=>setRate({...rate,to:e.target.value})}/><input type="number" className={input} style={style} placeholder="Cena za dobę" value={rate.price||""} onChange={e=>setRate({...rate,price:Number(e.target.value)})}/><input className={input} style={style} placeholder="Nazwa, np. Wakacje" value={rate.label} onChange={e=>setRate({...rate,label:e.target.value})}/></div><button disabled={busy||!rate.from||!rate.to} onClick={async()=>{if(await call("seller_booking_rate_upsert",{p_offer:offerId,p_id:null,p_from:rate.from,p_to:rate.to,p_price:rate.price||null,p_min_units:rate.minUnits||null,p_label:rate.label,p_priority:0,p_active:true}))setRate({from:"",to:"",price:0,minUnits:1,label:""})}} className="mt-3 w-full rounded-xl py-2.5 font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dodaj stawkę</button></Card>}
   </div>
  </>}
 </Shell>
}
function Card({children}:{children:React.ReactNode}){return <section className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>{children}</section>}
function Shell({children}:{children:React.ReactNode}){return <main className="min-h-screen px-4 py-8" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-6xl">{children}</div></main>}
