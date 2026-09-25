import { FormEvent, useEffect, useMemo, useState } from "react";
import { categoryCounts } from "../lib/api";
import { SiteHeader } from "../components/home/SiteChrome";
import { HomeFooter } from "../components/home/HomeShared";
import { supabase } from "../lib/supabase";
import { zl, pkt } from "../lib/money";
import { getMarketConfig, cashbackFor } from "../lib/marketConfig";
import { useSeo } from "../lib/seo";
import CategoryAds from "../components/CategoryAds";

type Mode = "car" | "property";
type Offer = { offer_id:string; title:string; price_gross:number; category:string; category_slug:string; seller:string; image_url:string|null; attributes:Record<string,any> };
type Cat = { id:string; slug:string; name:string };

const glass: React.CSSProperties = { background:"var(--glass)", border:"1px solid var(--line)", color:"var(--ink)" };
const inp = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";

export default function CategoryPortal({mode}:{mode:Mode}){
  const [cashbackRate,setCashbackRate]=useState(0.03);
  useEffect(()=>{getMarketConfig().then(c=>setCashbackRate(c.cashbackRate)).catch(()=>{});},[]);
  const car = mode === "car";
  const rootSlug = car ? "motoryzacja" : "nieruchomosci";
  // Portal działu ma pokazywać CAŁY dział — kafel na stronie głównej liczy korzeń
  // (liczby_dzialow), więc zawężenie do jednej podkategorii dawało „4 oferty" na kafelku
  // i dwie na liście: części i wynajem były niewidoczne (zgłoszenie właściciela 2026-09-25).
  const searchSlug = rootSlug;
  const title = car ? "Motoryzacja" : "Nieruchomości";
  const [latest,setLatest]=useState<Offer[]>([]); const [cheap,setCheap]=useState<Offer[]>([]); const [results,setResults]=useState<Offer[]>([]); const [cats,setCats]=useState<Cat[]>([]);
  const [busy,setBusy]=useState(false); const [searched,setSearched]=useState(false);
  // null = jeszcze nie wiadomo. Dział bez ani jednej oferty nie ma po co pokazywać
  // formularza z metrażem i liczbą pokoi — to pola, którymi nie da się nic znaleźć
  // (zgłoszenie właściciela 2026-09-25).
  const [pustyDzial,setPustyDzial]=useState<boolean|null>(null);
  const [q,setQ]=useState(""); const [priceMin,setPriceMin]=useState(""); const [priceMax,setPriceMax]=useState("");
  const [brand,setBrand]=useState(""); const [model,setModel]=useState(""); const [fuel,setFuel]=useState(""); const [gearbox,setGearbox]=useState(""); const [yearMin,setYearMin]=useState(""); const [yearMax,setYearMax]=useState(""); const [mileageMax,setMileageMax]=useState("");
  const [location,setLocation]=useState(""); const [areaMin,setAreaMin]=useState(""); const [areaMax,setAreaMax]=useState(""); const [roomsMin,setRoomsMin]=useState(""); const [marketType,setMarketType]=useState("");
  useSeo(`${title} — Sunrise Market`, car ? "Samochody używane i nowe w Sunrise Market. Filtruj po marce, modelu, roku, przebiegu i cenie." : "Mieszkania, domy, działki i lokale w Sunrise Market. Filtruj po lokalizacji, metrażu, pokojach i cenie.", car?"/motoryzacja":"/nieruchomosci");

  const filters=useMemo(()=>{const f:Record<string,string>={}; const put=(k:string,v:string)=>{if(v.trim())f[k]=v.trim()}; if(car){put("brand",brand);put("model",model);put("fuel",fuel);put("gearbox",gearbox);put("year_min",yearMin);put("year_max",yearMax);put("mileage_max",mileageMax);}else{put("location",location);put("area_min",areaMin);put("area_max",areaMax);put("rooms_min",roomsMin);put("market_type",marketType);} return f;},[car,brand,model,fuel,gearbox,yearMin,yearMax,mileageMax,location,areaMin,areaMax,roomsMin,marketType]);

  async function query(sort:string,limit=8, customFilters:Record<string,string>={}){
    const {data}=await supabase.rpc("search_offers_v2",{p_query:null,p_category_slug:searchSlug,p_price_min:null,p_price_max:null,p_sort:sort,p_limit:limit,p_filters:customFilters}); return (data||[]) as Offer[];
  }
  useEffect(()=>{
    query("najnowsze",8).then(r=>{ setLatest(r); setPustyDzial(r.length===0); }).catch(()=>setPustyDzial(null));
    query("cena_rosnaco",8).then(setCheap);
    supabase.from("categories").select("id,slug,name,parent_id").eq("slug",rootSlug).maybeSingle().then(({data})=>{
      // Podkategorie bez ani jednej aktywnej oferty nie trafiaja na pasek —
      // total_cnt z category_counts liczy takze oferty w glebszych poziomach.
      if(data?.id) Promise.all([
        supabase.from("categories").select("id,slug,name").eq("parent_id",data.id).order("sort_order"),
        categoryCounts().catch(()=>({byId:{} as Record<string,number>,total:0})),
      ]).then(([{data:ch},{byId}])=>{
        const lista=(ch||[]) as Cat[];
        setCats(Object.keys(byId).length ? lista.filter(c=>(byId[c.id]??0)>0) : lista);
      });
    });
  },[mode]);

  async function run(e?:FormEvent){e?.preventDefault();setBusy(true);setSearched(true); const {data,error}=await supabase.rpc("search_offers_v2",{p_query:q.trim()||null,p_category_slug:searchSlug,p_price_min:priceMin?Number(priceMin):null,p_price_max:priceMax?Number(priceMax):null,p_sort:"trafnosc",p_limit:100,p_filters:filters}); setBusy(false); setResults(error?[]:(data||[]) as Offer[]);}

  return <main className="min-h-screen" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <SiteHeader active={car?"car":"property"} />
    <section className="mx-auto max-w-7xl px-4 py-8"><div className="rounded-[32px] p-6 sm:p-10" style={{background:"linear-gradient(135deg,rgba(232,137,26,.18),rgba(56,224,240,.08))",border:"1px solid var(--line)"}}><div className="text-xs font-semibold tracking-wider" style={{color:"var(--gold)"}}>SUNRISE MARKET · {title.toUpperCase()}</div><h1 className="mt-2 text-4xl font-semibold sm:text-6xl">{car?"Znajdź auto, które pasuje do Ciebie.":"Znajdź miejsce, które będzie Twoje."}</h1><p className="mt-3 max-w-2xl" style={{color:"var(--mut)"}}>{car?"Przeglądaj samochody od sprzedawców i firm. Porównuj cenę, przebieg, rocznik i wyposażenie.":"Mieszkania, domy, działki i lokale. Szybkie filtrowanie i bezpośredni kontakt ze sprzedawcą."}</p>
      {pustyDzial!==true&&<form onSubmit={run} className="mt-7 rounded-2xl p-4" style={glass}><div className="grid gap-3 md:grid-cols-4"><Field label="Szukaj"><input className={inp} style={glass} value={q} onChange={e=>setQ(e.target.value)} placeholder={car?"Ford Fiesta":"mieszkanie Poznań"}/></Field><Field label="Cena od"><input className={inp} style={glass} type="number" value={priceMin} onChange={e=>setPriceMin(e.target.value)}/></Field><Field label="Cena do"><input className={inp} style={glass} type="number" value={priceMax} onChange={e=>setPriceMax(e.target.value)}/></Field>{car?<Field label="Marka"><input className={inp} style={glass} value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Ford"/></Field>:<Field label="Lokalizacja"><input className={inp} style={glass} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Poznań"/></Field>}
      {car?<><Field label="Model"><input className={inp} style={glass} value={model} onChange={e=>setModel(e.target.value)}/></Field><Field label="Paliwo"><select className={inp} style={glass} value={fuel} onChange={e=>setFuel(e.target.value)}><option value="">Dowolne</option><option>Benzyna</option><option>Diesel</option><option>Hybryda</option><option>Elektryczny</option><option>LPG</option></select></Field><Field label="Skrzynia"><select className={inp} style={glass} value={gearbox} onChange={e=>setGearbox(e.target.value)}><option value="">Dowolna</option><option>Manualna</option><option>Automatyczna</option></select></Field><Field label="Rok od"><input className={inp} style={glass} type="number" value={yearMin} onChange={e=>setYearMin(e.target.value)}/></Field><Field label="Rok do"><input className={inp} style={glass} type="number" value={yearMax} onChange={e=>setYearMax(e.target.value)}/></Field><Field label="Przebieg do"><input className={inp} style={glass} type="number" value={mileageMax} onChange={e=>setMileageMax(e.target.value)}/></Field></>:<><Field label="Metraż od"><input className={inp} style={glass} type="number" value={areaMin} onChange={e=>setAreaMin(e.target.value)}/></Field><Field label="Metraż do"><input className={inp} style={glass} type="number" value={areaMax} onChange={e=>setAreaMax(e.target.value)}/></Field><Field label="Min. pokoi"><input className={inp} style={glass} type="number" value={roomsMin} onChange={e=>setRoomsMin(e.target.value)}/></Field><Field label="Rynek"><select className={inp} style={glass} value={marketType} onChange={e=>setMarketType(e.target.value)}><option value="">Dowolny</option><option>Pierwotny</option><option>Wtórny</option></select></Field></>}</div><button className="mt-4 rounded-xl px-6 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{busy?"Szukam…":"Pokaż oferty"}</button></form>}</div></section>
    <CategoryAds mode={mode}/>
    {cats.length>0&&<section className="mx-auto max-w-7xl px-4 pb-4"><div className="flex gap-2 overflow-x-auto">{cats.map(c=><a key={c.id} href={`/szukaj?kat=${encodeURIComponent(c.slug)}`} className="whitespace-nowrap rounded-full px-4 py-2 text-sm" style={glass}>{c.name}</a>)}</div></section>}
    {/* „Pokaż oferty” bez wyników nie mogło renderować pustki — dla klienta wyglądało to jak
        zepsuty przycisk. Tak samo cały portal, gdy w dziale nie ma jeszcze ani jednej oferty
        (Nieruchomości: 0 ofert, zgłoszenie właściciela 2026-09-25). */}
    {searched&&(results.length>0
      ? <OfferSection title={`Wyniki wyszukiwania (${results.length})`} rows={results} car={car} rate={cashbackRate}/>
      : <PustyWynik car={car} tytul="Brak ofert dla tych kryteriów" opis="Zmień lub wyczyść filtry — pokazujemy tylko oferty, które naprawdę są w Market." onReset={()=>{setSearched(false);setResults([]);setQ("");setPriceMin("");setPriceMax("");setBrand("");setModel("");setFuel("");setGearbox("");setYearMin("");setYearMax("");setMileageMax("");setLocation("");setAreaMin("");setAreaMax("");setRoomsMin("");setMarketType("");}}/>)}
    <OfferSection title="Najnowsze" rows={latest} car={car} rate={cashbackRate}/><OfferSection title={car?"Najtańsze auta":"Najniższa cena"} rows={cheap} car={car} rate={cashbackRate}/>
    {!searched&&pustyDzial===true&&<PustyWynik car={car} tytul={car?"Nie ma jeszcze ogłoszeń motoryzacyjnych":"Nie ma jeszcze ogłoszeń nieruchomości"} opis="Ten dział dopiero się zapełnia. Nie pokazujemy wyników, których nie ma — ale możesz być pierwszy."/>}
    <section className="mx-auto max-w-7xl px-4 pb-16"><div className="rounded-3xl p-6 text-center" style={glass}><h2 className="text-2xl font-semibold">Masz {car?"samochód":"nieruchomość"} na sprzedaż?</h2><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>Dodaj ogłoszenie w kilka minut i pokaż je klientom Sunrise Market.</p><a href={`/sprzedawca/wystaw?typ=${car?"samochod":"nieruchomosc"}`} className="mt-4 inline-block rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Dodaj ogłoszenie</a></div></section>
    <HomeFooter />
  </main>;
}
function PustyWynik({car,tytul,opis,onReset}:{car:boolean;tytul:string;opis:string;onReset?:()=>void}){
  return <section className="mx-auto max-w-7xl px-4 py-6"><div className="rounded-3xl p-8 text-center" style={glass}>
    <div className="text-4xl">{car?"🚗":"🏠"}</div>
    <h2 className="mt-3 text-xl font-bold">{tytul}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm" style={{color:"var(--mut)"}}>{opis}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3">
      {onReset&&<button type="button" onClick={onReset} className="rounded-xl px-5 py-3 text-sm font-semibold" style={glass}>Wyczyść filtry</button>}
      <a href={`/sprzedawca/wystaw?typ=${car?"samochod":"nieruchomosc"}`} className="rounded-xl px-5 py-3 text-sm font-bold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Dodaj ogłoszenie</a>
      <a href="/sklep" className="rounded-xl px-5 py-3 text-sm font-semibold" style={glass}>Przeglądaj inne oferty</a>
    </div>
  </div></section>;
}
function OfferSection({title,rows,car,rate=0.03}:{title:string;rows:Offer[];car:boolean;rate?:number}){if(!rows.length)return null;return <section className="mx-auto max-w-7xl px-4 py-6"><div className="mb-4 flex items-end justify-between"><h2 className="border-l-4 pl-4 text-2xl font-bold" style={{borderColor:"var(--gold)"}}>{title}</h2><a href={car?"/szukaj?kat=motoryzacja":"/szukaj?kat=nieruchomosci"} className="text-sm" style={{color:"var(--gold)"}}>Zobacz wszystkie →</a></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{rows.map(o=><OfferCard key={o.offer_id} o={o} car={car} rate={rate} />)}</div></section>}
function OfferCard({o,car,rate=0.03}:{o:Offer;car:boolean;rate?:number}){const a=o.attributes||{}; const cashback=cashbackFor(Number(o.price_gross), rate); const meta=car?[a.year,a.mileage_km&&`${Number(a.mileage_km).toLocaleString("pl-PL")} km`,a.fuel,a.power_hp&&`${a.power_hp} KM`]:[a.area_m2&&`${a.area_m2} m²`,a.rooms&&`${a.rooms} pok.`,a.location,a.area_m2&&`${Math.round(Number(o.price_gross)/Number(a.area_m2)).toLocaleString("pl-PL")} zł/m²`];return <a href={`/produkt/${o.offer_id}`} className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-1" style={glass}><div className="h-48 overflow-hidden">{o.image_url?<img src={o.image_url} alt={o.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-5xl">{car?"🚗":"🏠"}</div>}</div><div className="p-4"><div className="line-clamp-2 font-semibold">{o.title}</div><div className="mt-2 text-2xl font-bold" style={{color:"var(--gold)"}}>{zl(o.price_gross)}</div><div className="mt-2 text-xs" style={{color:"var(--mut)"}}>{meta.filter(Boolean).join(" · ")}</div><div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{background:"rgba(122,184,154,.12)",color:"var(--green)"}}>+{pkt(cashback)} pkt cashback</span>{a.full_vat_invoice&&<span className="rounded-full px-2 py-1 text-[11px]" style={{border:"1px solid var(--line)"}}>Faktura VAT</span>}</div></div></a>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-xs"><span className="mb-1 block" style={{color:"var(--mut)"}}>{label}</span>{children}</label>}
