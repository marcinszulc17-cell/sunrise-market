import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Mode = "car" | "property";
type Offer = { offer_id:string; title:string; price_gross:number; category:string; category_slug:string; seller:string; image_url:string|null; attributes:Record<string,any> };

const glass: React.CSSProperties = { background:"var(--glass)", border:"1px solid var(--line)", color:"var(--ink)" };
const input = "w-full rounded-xl px-3 py-2 text-sm outline-none";

export default function MarketSmartFilterDock(){
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>("car");
  const [rows,setRows]=useState<Offer[]>([]);
  const [busy,setBusy]=useState(false);
  const [searched,setSearched]=useState(false);
  const [priceMin,setPriceMin]=useState(""); const [priceMax,setPriceMax]=useState("");
  const [brand,setBrand]=useState(""); const [model,setModel]=useState(""); const [fuel,setFuel]=useState(""); const [gearbox,setGearbox]=useState("");
  const [yearMin,setYearMin]=useState(""); const [yearMax,setYearMax]=useState(""); const [mileageMax,setMileageMax]=useState("");
  const [location,setLocation]=useState(""); const [areaMin,setAreaMin]=useState(""); const [areaMax,setAreaMax]=useState(""); const [roomsMin,setRoomsMin]=useState(""); const [marketType,setMarketType]=useState("");

  useEffect(()=>{
    const onClick=(e:MouseEvent)=>{
      const el=(e.target as HTMLElement)?.closest("button,a");
      const text=(el?.textContent||"").toLowerCase();
      if(text.includes("motoryz")){ setMode("car"); setOpen(true); setRows([]); setSearched(false); }
      if(text.includes("nieruchomo")){ setMode("property"); setOpen(true); setRows([]); setSearched(false); }
    };
    document.addEventListener("click",onClick,true);
    return()=>document.removeEventListener("click",onClick,true);
  },[]);

  const filters=useMemo(()=>{
    const f:Record<string,string>={}; const put=(k:string,v:string)=>{if(v.trim())f[k]=v.trim();};
    if(mode==="car"){put("brand",brand);put("model",model);put("fuel",fuel);put("gearbox",gearbox);put("year_min",yearMin);put("year_max",yearMax);put("mileage_max",mileageMax);}
    else {put("location",location);put("area_min",areaMin);put("area_max",areaMax);put("rooms_min",roomsMin);put("market_type",marketType);}
    return f;
  },[mode,brand,model,fuel,gearbox,yearMin,yearMax,mileageMax,location,areaMin,areaMax,roomsMin,marketType]);

  async function run(){
    setBusy(true); setSearched(true);
    const {data,error}=await supabase.rpc("search_offers_v2",{
      p_query:null,
      p_category_slug:mode==="car"?"motoryzacja-samochody-osobowe":"nieruchomosci",
      p_price_min:priceMin?Number(priceMin):null,
      p_price_max:priceMax?Number(priceMax):null,
      p_sort:"trafnosc", p_limit:100, p_filters:filters
    });
    setBusy(false);
    setRows(error?[]:(data||[]) as Offer[]);
  }
  function clear(){ setPriceMin("");setPriceMax("");setBrand("");setModel("");setFuel("");setGearbox("");setYearMin("");setYearMax("");setMileageMax("");setLocation("");setAreaMin("");setAreaMax("");setRoomsMin("");setMarketType("");setRows([]);setSearched(false); }

  if(!open) return <div className="fixed bottom-5 right-5 z-40"><button onClick={()=>setOpen(true)} className="rounded-full px-4 py-3 text-sm font-semibold text-black shadow-xl" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>⚙ Filtry</button></div>;

  return <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/35 sm:items-stretch" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
    <aside className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-4 shadow-2xl sm:max-h-none sm:w-[460px] sm:rounded-none" style={{background:"var(--bg)",borderLeft:"1px solid var(--line)"}}>
      <div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>SZYBKIE FILTRY</div><h2 className="text-2xl font-semibold">{mode==="car"?"🚗 Motoryzacja":"🏠 Nieruchomości"}</h2></div><button onClick={()=>setOpen(false)} className="rounded-full px-3 py-2" style={glass}>✕</button></div>
      <div className="mb-4 grid grid-cols-2 gap-2"><button onClick={()=>{setMode("car");clear()}} className="rounded-xl p-2 text-sm font-semibold" style={mode==="car"?{background:"linear-gradient(135deg,#C8965A,#E8C896)",color:"#000"}:glass}>Samochody</button><button onClick={()=>{setMode("property");clear()}} className="rounded-xl p-2 text-sm font-semibold" style={mode==="property"?{background:"linear-gradient(135deg,#C8965A,#E8C896)",color:"#000"}:glass}>Nieruchomości</button></div>
      <div className="grid grid-cols-2 gap-2"><F label="Cena od"><input className={input} style={glass} type="number" value={priceMin} onChange={e=>setPriceMin(e.target.value)}/></F><F label="Cena do"><input className={input} style={glass} type="number" value={priceMax} onChange={e=>setPriceMax(e.target.value)}/></F>
      {mode==="car"?<><F label="Marka"><input className={input} style={glass} value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Ford"/></F><F label="Model"><input className={input} style={glass} value={model} onChange={e=>setModel(e.target.value)} placeholder="Fiesta"/></F><F label="Paliwo"><select className={input} style={glass} value={fuel} onChange={e=>setFuel(e.target.value)}><option value="">Dowolne</option><option>Benzyna</option><option>Diesel</option><option>Hybryda</option><option>Elektryczny</option><option>LPG</option></select></F><F label="Skrzynia"><select className={input} style={glass} value={gearbox} onChange={e=>setGearbox(e.target.value)}><option value="">Dowolna</option><option>Manualna</option><option>Automatyczna</option></select></F><F label="Rok od"><input className={input} style={glass} type="number" value={yearMin} onChange={e=>setYearMin(e.target.value)}/></F><F label="Rok do"><input className={input} style={glass} type="number" value={yearMax} onChange={e=>setYearMax(e.target.value)}/></F><F label="Przebieg do"><input className={input} style={glass} type="number" value={mileageMax} onChange={e=>setMileageMax(e.target.value)} placeholder="km"/></F></>:<><F label="Lokalizacja"><input className={input} style={glass} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Poznań"/></F><F label="Metraż od"><input className={input} style={glass} type="number" value={areaMin} onChange={e=>setAreaMin(e.target.value)}/></F><F label="Metraż do"><input className={input} style={glass} type="number" value={areaMax} onChange={e=>setAreaMax(e.target.value)}/></F><F label="Min. pokoi"><input className={input} style={glass} type="number" value={roomsMin} onChange={e=>setRoomsMin(e.target.value)}/></F><F label="Rynek"><select className={input} style={glass} value={marketType} onChange={e=>setMarketType(e.target.value)}><option value="">Dowolny</option><option>Pierwotny</option><option>Wtórny</option></select></F></>}</div>
      <div className="mt-4 flex gap-2"><button onClick={run} disabled={busy} className="flex-1 rounded-xl py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{busy?"Szukam…":"Pokaż oferty"}</button><button onClick={clear} className="rounded-xl px-4 text-sm" style={glass}>Wyczyść</button></div>
      {searched&&<div className="mt-5"><div className="mb-3 text-sm" style={{color:"var(--mut)"}}>{rows.length?`Znaleziono ${rows.length} ofert`:`Brak ofert spełniających kryteria`}</div><div className="space-y-3">{rows.map(o=><a key={o.offer_id} href={`/produkt/${o.offer_id}`} className="flex gap-3 rounded-2xl p-2" style={glass}><div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl">{o.image_url?<img src={o.image_url} alt="" className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-3xl">{mode==="car"?"🚗":"🏠"}</div>}</div><div className="min-w-0"><div className="line-clamp-2 text-sm font-semibold">{o.title}</div><div className="mt-1 font-bold">{zl(o.price_gross)}</div><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>{mode==="car"?[o.attributes?.year,o.attributes?.mileage_km&&`${Number(o.attributes.mileage_km).toLocaleString("pl-PL")} km`,o.attributes?.fuel].filter(Boolean).join(" · "):[o.attributes?.location,o.attributes?.area_m2&&`${o.attributes.area_m2} m²`,o.attributes?.rooms&&`${o.attributes.rooms} pok.`].filter(Boolean).join(" · ")}</div></div></a>)}</div></div>}
    </aside>
  </div>;
}
function F({label,children}:{label:string;children:React.ReactNode}){return <label className="text-xs"><span className="mb-1 block" style={{color:"var(--mut)"}}>{label}</span>{children}</label>}
