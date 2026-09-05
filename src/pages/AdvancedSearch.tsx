import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Offer = { offer_id:string; title:string; price_gross:number; category:string; category_slug:string; seller:string; image_url:string|null; attributes:Record<string,any> };
type Mode = "car" | "property";

const box: React.CSSProperties = { background:"var(--glass)", border:"1px solid var(--line)", color:"var(--ink)" };

export default function AdvancedSearch(){
  const [mode,setMode]=useState<Mode>("car");
  const [q,setQ]=useState("");
  const [priceMin,setPriceMin]=useState(""); const [priceMax,setPriceMax]=useState("");
  const [brand,setBrand]=useState(""); const [model,setModel]=useState(""); const [fuel,setFuel]=useState(""); const [gearbox,setGearbox]=useState("");
  const [yearMin,setYearMin]=useState(""); const [yearMax,setYearMax]=useState(""); const [mileageMax,setMileageMax]=useState("");
  const [location,setLocation]=useState(""); const [areaMin,setAreaMin]=useState(""); const [areaMax,setAreaMax]=useState(""); const [roomsMin,setRoomsMin]=useState(""); const [marketType,setMarketType]=useState("");
  const [sort,setSort]=useState("trafnosc"); const [rows,setRows]=useState<Offer[]>([]); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState<string|null>(null);

  const filters=useMemo(()=>{
    const f:Record<string,string>={};
    const put=(k:string,v:string)=>{ if(v.trim()) f[k]=v.trim(); };
    if(mode==="car"){ put("brand",brand); put("model",model); put("fuel",fuel); put("gearbox",gearbox); put("year_min",yearMin); put("year_max",yearMax); put("mileage_max",mileageMax); }
    else { put("location",location); put("area_min",areaMin); put("area_max",areaMax); put("rooms_min",roomsMin); put("market_type",marketType); }
    return f;
  },[mode,brand,model,fuel,gearbox,yearMin,yearMax,mileageMax,location,areaMin,areaMax,roomsMin,marketType]);

  async function search(e?:FormEvent){ e?.preventDefault(); setBusy(true); setMsg(null);
    const slug=mode==="car"?"motoryzacja-samochody-osobowe":"nieruchomosci";
    const {data,error}=await supabase.rpc("search_offers_v2",{p_query:q.trim()||null,p_category_slug:slug,p_price_min:priceMin?Number(priceMin):null,p_price_max:priceMax?Number(priceMax):null,p_sort:sort,p_limit:100,p_filters:filters});
    setBusy(false); if(error){setMsg(error.message);setRows([]);return;} setRows((data||[]) as Offer[]); if(!(data||[]).length)setMsg("Brak ofert spełniających wybrane kryteria.");
  }
  function reset(){ setQ("");setPriceMin("");setPriceMax("");setBrand("");setModel("");setFuel("");setGearbox("");setYearMin("");setYearMax("");setMileageMax("");setLocation("");setAreaMin("");setAreaMax("");setRoomsMin("");setMarketType("");setRows([]);setMsg(null); }

  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex items-center gap-3"><a href="/" className="text-sm">← Market</a><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>SUNRISE MARKET</div><h1 className="text-3xl font-semibold">Wyszukiwarka zaawansowana</h1></div></div>
    <div className="mb-5 grid max-w-xl grid-cols-2 gap-2"><button onClick={()=>{setMode("car");reset();}} className="rounded-xl p-3 font-semibold" style={mode==="car"?{background:"linear-gradient(135deg,#E8891A,#F5A623)",color:"#000"}:box}>🚗 Samochody</button><button onClick={()=>{setMode("property");reset();}} className="rounded-xl p-3 font-semibold" style={mode==="property"?{background:"linear-gradient(135deg,#E8891A,#F5A623)",color:"#000"}:box}>🏠 Nieruchomości</button></div>
    <form onSubmit={search} className="rounded-3xl p-5 sm:p-6" style={box}><div className="grid gap-3 md:grid-cols-4">
      <Field label="Szukaj"><input value={q} onChange={e=>setQ(e.target.value)} placeholder={mode==="car"?"np. Ford Fiesta":"np. mieszkanie centrum"}/></Field>
      <Field label="Cena od"><input type="number" value={priceMin} onChange={e=>setPriceMin(e.target.value)}/></Field><Field label="Cena do"><input type="number" value={priceMax} onChange={e=>setPriceMax(e.target.value)}/></Field>
      <Field label="Sortowanie"><select value={sort} onChange={e=>setSort(e.target.value)}><option value="trafnosc">Trafność</option><option value="cena_rosnaco">Cena: rosnąco</option><option value="cena_malejaco">Cena: malejąco</option><option value="najnowsze">Najnowsze</option></select></Field>
      {mode==="car"? <><Field label="Marka"><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Ford"/></Field><Field label="Model"><input value={model} onChange={e=>setModel(e.target.value)} placeholder="Fiesta"/></Field><Field label="Paliwo"><select value={fuel} onChange={e=>setFuel(e.target.value)}><option value="">Dowolne</option><option>Benzyna</option><option>Diesel</option><option>Hybryda</option><option>Elektryczny</option><option>LPG</option></select></Field><Field label="Skrzynia"><select value={gearbox} onChange={e=>setGearbox(e.target.value)}><option value="">Dowolna</option><option>Manualna</option><option>Automatyczna</option></select></Field><Field label="Rok od"><input type="number" value={yearMin} onChange={e=>setYearMin(e.target.value)}/></Field><Field label="Rok do"><input type="number" value={yearMax} onChange={e=>setYearMax(e.target.value)}/></Field><Field label="Przebieg do (km)"><input type="number" value={mileageMax} onChange={e=>setMileageMax(e.target.value)}/></Field></> : <><Field label="Lokalizacja"><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Poznań"/></Field><Field label="Metraż od"><input type="number" value={areaMin} onChange={e=>setAreaMin(e.target.value)}/></Field><Field label="Metraż do"><input type="number" value={areaMax} onChange={e=>setAreaMax(e.target.value)}/></Field><Field label="Min. pokoi"><input type="number" value={roomsMin} onChange={e=>setRoomsMin(e.target.value)}/></Field><Field label="Rynek"><select value={marketType} onChange={e=>setMarketType(e.target.value)}><option value="">Dowolny</option><option>Pierwotny</option><option>Wtórny</option></select></Field></>}
    </div><div className="mt-5 flex gap-2"><button disabled={busy} className="rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{busy?"Szukam…":"Pokaż oferty"}</button><button type="button" onClick={reset} className="rounded-xl px-4 py-3 text-sm" style={box}>Wyczyść</button></div></form>
    {msg&&<div className="mt-5 text-sm" style={{color:"var(--mut)"}}>{msg}</div>}
    {rows.length>0&&<section className="mt-7"><div className="mb-4 text-sm" style={{color:"var(--mut)"}}>Znaleziono: {rows.length}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rows.map(o=><a href={`/produkt/${o.offer_id}`} key={o.offer_id} className="overflow-hidden rounded-2xl" style={box}><div className="h-44 overflow-hidden" style={{background:"var(--glass)"}}>{o.image_url?<img src={o.image_url} alt={o.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-5xl">{mode==="car"?"🚗":"🏠"}</div>}</div><div className="p-4"><div className="text-xs" style={{color:"var(--mut)"}}>{o.category}</div><div className="mt-1 font-semibold">{o.title}</div><div className="mt-2 text-2xl font-bold">{zl(o.price_gross)}</div>{mode==="car"&&<div className="mt-2 text-xs" style={{color:"var(--mut)"}}>{[o.attributes?.year,o.attributes?.mileage_km&&`${Number(o.attributes.mileage_km).toLocaleString("pl-PL")} km`,o.attributes?.fuel].filter(Boolean).join(" · ")}</div>}{mode==="property"&&<div className="mt-2 text-xs" style={{color:"var(--mut)"}}>{[o.attributes?.location,o.attributes?.area_m2&&`${o.attributes.area_m2} m²`,o.attributes?.rooms&&`${o.attributes.rooms} pok.`].filter(Boolean).join(" · ")}</div>}</div></a>)}</div></section>}
  </div></main>;
}
function Field({label,children}:{label:string;children:React.ReactElement}){return <label className="text-sm"><span className="mb-1 block" style={{color:"var(--mut)"}}>{label}</span><div className="[&_input]:w-full [&_select]:w-full [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:px-3 [&_select]:px-3 [&_input]:py-2.5 [&_select]:py-2.5 [&_input]:outline-none [&_select]:outline-none [&_input]:bg-transparent [&_select]:bg-transparent" style={{border:"1px solid var(--line)",borderRadius:12}}>{children}</div></label>}
