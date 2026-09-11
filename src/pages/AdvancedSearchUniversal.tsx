import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SearchBox from "../components/SearchBox";
import SavedSearchButton, { ActiveFilterChips } from "../components/SavedSearches";
import { offerDetailHref } from "../lib/bookingLink";
import { categoryCounts } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { ViewToggle, useViewMode, Ico, HomeFooter, timeAgo } from "../components/home/HomeShared";
import { SiteHeader, REGIONS, readRegion } from "../components/home/SiteChrome";

type Offer = { offer_id:string; title:string; price_gross:number; category:string; category_slug:string; seller:string; image_url:string|null; attributes:Record<string,any>; created_at?:string|null; views?:number };
type Category = { id:string; slug:string; name:string; parent_id:string|null; sort_order?:number|null };
type AttrDef = { key:string; label:string; data_type:"text"|"number"|"bool"|"enum"; options:any };
type PurchaseModeFilter = "" | "purchase" | "appointment" | "daily";

const PRIVATE_FILTER_KEYS = new Set(["vin","registration_number","kw_number","offer_type","cashback_only","purchase_mode"]);
const box: React.CSSProperties = { background:"var(--glass)", border:"1px solid var(--line)", color:"var(--ink)" };
const MODE_FILTERS: { id:PurchaseModeFilter; icon:string; label:string; description:string }[] = [
  { id:"", icon:"☰", label:"Wszystko", description:"Zakupy, usługi i wynajem" },
  { id:"purchase", icon:"🛒", label:"Kup", description:"Kupujesz od razu" },
  { id:"appointment", icon:"⏱️", label:"Usługi", description:"Wybierasz dzień i godzinę" },
  { id:"daily", icon:"🗓️", label:"Wynajem", description:"Wybierasz okres od–do" },
];

function resultMode(offer:Offer){
  const mode=String(offer.attributes?.purchase_mode||"purchase");
  if(mode==="appointment") return {label:"📅 Usługa na termin",cta:"Umów termin",booking:true};
  if(mode==="daily") return {label:"🗓️ Wynajem",cta:"Wybierz daty",booking:true};
  return {label:"🛒 Sprzedaż",cta:"Zobacz ofertę",booking:false};
}

function emoji(name:string){
  const t=name.toLowerCase();
  if(t.includes("motoryz")) return "🚗";
  if(t.includes("nieruch")) return "🏠";
  if(t.includes("usług")) return "🛠️";
  if(t.includes("elektr")) return "💻";
  if(t.includes("dom")||t.includes("ogr")) return "🏡";
  if(t.includes("moda")) return "👟";
  if(t.includes("zdrow")||t.includes("urod")) return "💆";
  if(t.includes("sport")) return "🚴";
  if(t.includes("dziec")) return "🧸";
  if(t.includes("super")) return "🛒";
  if(t.includes("firma")||t.includes("przem")) return "🏭";
  if(t.includes("kultur")||t.includes("rozryw")) return "🎬";
  if(t.includes("zwierz")) return "🐾";
  if(t.includes("energ")||t.includes("oze")) return "⚡";
  return "📦";
}

// Drzewo kategorii pobieramy raz na sesję (kolejne wejścia na /szukaj nie czekają na bazę).
let categoriesCache:Promise<Category[]>|null=null;
function loadCategories():Promise<Category[]>{
  if(!categoriesCache) categoriesCache=(async()=>{ const {data,error}=await supabase.from("categories").select("id,slug,name,parent_id,sort_order").order("sort_order").order("name"); if(error||!data){ categoriesCache=null; return []; } return data as Category[]; })();
  return categoriesCache;
}

function normalizeOptions(options:any):string[]{
  if(Array.isArray(options)) return options.map(String);
  if(Array.isArray(options?.values)) return options.values.map(String);
  if(Array.isArray(options?.options)) return options.options.map(String);
  return [];
}

export default function AdvancedSearchUniversal(){
  const [categories,setCategories]=useState<Category[]>([]);
  const [selected,setSelected]=useState<string>("");
  const [mode,setMode]=useState<PurchaseModeFilter>("");
  const [q,setQ]=useState("");
  const [priceMin,setPriceMin]=useState("");
  const [priceMax,setPriceMax]=useState("");
  const [sort,setSort]=useState("trafnosc");
  const [defs,setDefs]=useState<AttrDef[]>([]);
  const [filters,setFilters]=useState<Record<string,string|boolean>>({});
  const [rows,setRows]=useState<Offer[]>([]);
  const [busy,setBusy]=useState(false);
  const [loadingFilters,setLoadingFilters]=useState(false);
  const [msg,setMsg]=useState<string|null>(null);
  const [showFilters,setShowFilters]=useState(false);
  // Makiety właściciela 2026-09-10: przełącznik siatka/lista oraz liczby przy filtrach.
  const [view,setView]=useViewMode("szukaj");
  const [catCounts,setCatCounts]=useState<Record<string,number>>({});
  useEffect(()=>{ categoryCounts().then(c=>setCatCounts(c.byId)).catch(()=>{}); },[]);
  const [loc,setLoc]=useState(""); // lokalizacja: ?lok= z nagłówka (województwo) albo wpisana w filtrach — attributes.location ilike // telefon: filtry zwijane, wyniki od razu

  // Parametry z adresu (ekran startowy / linki / pasek działów): ?q=… ?kat=slug ?tryb=appointment|daily — po wczytaniu od razu szukamy.
  // Reagujemy na KAŻDĄ zmianę adresu (2026-09-06: przełączanie działów w nagłówku, gdy /szukaj już był otwarty, nie zmieniało wyników).
  const location=useLocation();
  // Licznik uruchomień (nie flaga): kilka „szukaj” w jednym cyklu nie może się zgubić ani zawiesić na true.
  const [run,setRun]=useState(0);
  const setAutoRun=(v:boolean)=>{ if(v) setRun(r=>r+1); };
  const fromUrl=useRef(false);
  const pendingFilters=useRef<Record<string,string|boolean>|null>(null); // filtry zapisanego wyszukiwania — nakładane po wczytaniu kategorii
  const mounted=useRef(false);
  useEffect(()=>{
    const sp=new URLSearchParams(location.search);
    if(mounted.current){ setPriceMin("");setPriceMax("");setFilters({});setDefs([]);setMsg(null); } // nowe kryteria z linku — czyścimy poprzednie
    mounted.current=true; fromUrl.current=true;
    const pq=sp.get("q")||"", pk=sp.get("kat")||"", pm=sp.get("tryb")||"", pl=sp.get("lok")||readRegion();
    const saved=sp.get("zapisane");
    if(saved){ // zapisane wyszukiwanie z powiadomienia / Ulubionych → odtwarzamy kryteria i zerujemy licznik „nowe”
      supabase.rpc("my_saved_searches").then(({data})=>{ const s=((data||[]) as any[]).find(x=>x.id===saved); if(!s) return;
        setQ(s.query||""); setSelected(s.category_slug||""); setPriceMin(s.price_min!=null?String(s.price_min):""); setPriceMax(s.price_max!=null?String(s.price_max):"");
        const f={...(s.filters||{})}; if(f.purchase_mode){ setMode(f.purchase_mode); delete f.purchase_mode; } if(f.location){ setLoc(String(f.location)); delete f.location; } setSort("najnowsze");
        if(s.category_slug){ pendingFilters.current=f; } else { setFilters(f); setAutoRun(true); }
        supabase.rpc("touch_saved_search",{p_id:saved}).then(()=>{},()=>{}); });
      loadCategories().then(setCategories);
      return;
    }
    if(pl) setLoc(pl);
    setQ(pq); setSelected(pk); setMode(pm==="appointment"||pm==="daily"||pm==="purchase"?pm as PurchaseModeFilter:"");
    setAutoRun(true); // zawsze pokazujemy oferty od razu (bez parametrów: wszystkie, wg trafności)
    loadCategories().then(setCategories);
  },[location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kategoria / tryb / sortowanie: wyniki odświeżają się same (bez „Pokaż oferty”); adres aktualizujemy cicho (replaceState, bez przeładowania).
  // Zmiana, która przyszła z adresu (fromUrl), już uruchamia szukanie w efekcie wyżej — tu ją pomijamy. Ten efekt musi być PRZED efektem [run].
  const firstCrit=useRef(true);
  useEffect(()=>{
    if(firstCrit.current){ firstCrit.current=false; return; }
    if(fromUrl.current){ fromUrl.current=false; return; }
    if(pendingFilters.current) return; // zapisane wyszukiwanie — szukamy po nałożeniu filtrów
    const sp=new URLSearchParams(window.location.search); const before=sp.toString();
    if(q.trim()) sp.set("q",q.trim()); else sp.delete("q");
    if(selected) sp.set("kat",selected); else sp.delete("kat");
    if(mode) sp.set("tryb",mode); else sp.delete("tryb");
    if(loc.trim()) sp.set("lok",loc.trim()); else sp.delete("lok");
    sp.delete("zapisane");
    if(sp.toString()!==before) window.history.replaceState(window.history.state,"",`${window.location.pathname}${sp.toString()?`?${sp}`:""}`);
    setAutoRun(true);
  },[selected,mode,sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ if(run>0){ fromUrl.current=false; search(); } },[run]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCategory=useMemo(()=>categories.find(c=>c.slug===selected)||null,[categories,selected]);
  const roots=useMemo(()=>categories.filter(c=>!c.parent_id),[categories]);
  const children=(id:string)=>categories.filter(c=>c.parent_id===id);

  useEffect(()=>{
    const pend=pendingFilters.current; pendingFilters.current=null;
    setFilters(pend||{}); setDefs([]);
    if(!selectedCategory?.id) return;
    let alive=true; setLoadingFilters(true);
    supabase.from("category_attributes").select("key,label,data_type,options").eq("category_id",selectedCategory.id).order("label")
      .then(({data})=>{ if(alive){setDefs(((data||[]) as AttrDef[]).filter(d=>!PRIVATE_FILTER_KEYS.has(d.key)));setLoadingFilters(false); if(pend) setAutoRun(true);} },()=>{if(alive){setDefs([]);setLoadingFilters(false); if(pend) setAutoRun(true);}});
    return()=>{alive=false;};
  },[selectedCategory?.id]);

  function setFilter(key:string,value:string|boolean){setFilters(prev=>({...prev,[key]:value}));}

  async function search(e?:FormEvent){
    e?.preventDefault(); setBusy(true); setMsg(null);
    const rpcFilters:Record<string,string|boolean>={};
    for(const [k,v] of Object.entries(filters)) if(v!==""&&v!==false) rpcFilters[k]=v;
    if(mode) rpcFilters.purchase_mode=mode;
    if(loc.trim()) rpcFilters.location=loc.trim();
    const {data,error}=await supabase.rpc("search_offers_v2",{
      p_query:q.trim()||null,
      p_category_slug:selected||null,
      p_price_min:priceMin?Number(priceMin):null,
      p_price_max:priceMax?Number(priceMax):null,
      p_sort:sort,
      p_limit:100,
      p_filters:rpcFilters,
    });
    setBusy(false);
    if(error){setMsg(error.message);setRows([]);return;}
    const found=(data||[]) as Offer[]; setRows(found);
    if(!found.length)setMsg("Brak ofert spełniających wybrane kryteria.");
  }

  function reset(){setQ("");setLoc("");setPriceMin("");setPriceMax("");setSort("trafnosc");setSelected("");setMode("");setFilters({});setDefs([]);setRows([]);setMsg(null);}

  const title=mode==="appointment"?"Rezerwacje":mode==="daily"?"Wynajem":selectedCategory?selectedCategory.name:"Wyszukiwarka";
  const subtitle=mode==="appointment"?"Usługi z terminarzem — wybierz dzień i godzinę, zapłać od razu.":mode==="daily"?"Wynajem na dni — wybierz okres od–do.":"Produkty, usługi, rezerwacje, wynajem, samochody i nieruchomości w jednym miejscu.";
  const chip=(on:boolean):React.CSSProperties=>on?{background:"rgba(245,166,35,.14)",border:"1px solid var(--gold)",color:"var(--gold)"}:{background:"rgba(255,255,255,.04)",border:"1px solid var(--line)",color:"var(--ink)"};

  return <main className="min-h-screen pb-24 sm:pb-0" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <SiteHeader active={mode==="appointment"?"booking":selected==="uslugi-i-reklama"?"services":selected==="oze-i-energia"?"energy":selected==="nieruchomosci"?"property":selected==="motoryzacja"?"car":undefined} />
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 xl:px-10">
    <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
      {/* ── Filtry ─────────────────────────────────────────── */}
      <aside className={`${showFilters?"":"hidden"} order-last h-fit rounded-2xl p-4 lg:order-none lg:block lg:sticky lg:top-24`} style={box} id="filtry">
        <div className="flex items-center justify-between"><div className="text-lg font-bold">Filtry</div><button type="button" onClick={reset} className="text-xs underline" style={{color:"var(--mut)"}}>Wyczyść wszystkie</button></div>
        <form onSubmit={search} className="mt-4 grid gap-4">
          <Field label="Szukaj"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Czego szukasz?"/></Field>
          <div><div className="mb-2 text-sm font-semibold">Jak chcesz skorzystać?</div><div className="grid gap-1.5">{MODE_FILTERS.map(item=><button type="button" key={item.id||"all"} onClick={()=>setMode(item.id)} className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-left text-sm" style={chip(mode===item.id)}><span>{item.icon}</span><span className="font-semibold">{item.label}</span><span className="ml-auto text-[11px]" style={{color:"var(--mut)"}}>{item.description}</span></button>)}</div></div>
          <div><div className="mb-2 flex items-center justify-between text-sm font-semibold"><span>Kategoria</span>{selected&&<button type="button" onClick={()=>{setSelected("");setFilters({});setDefs([]);}} className="text-xs font-normal" style={{color:"var(--gold)"}}>Wszystkie</button>}</div>
            <div className="grid max-h-72 gap-1 overflow-y-auto pr-1">{roots.map(r=><div key={r.id}><button type="button" onClick={()=>setSelected(selected===r.slug?"":r.slug)} className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm" style={chip(selected===r.slug||selectedCategory?.parent_id===r.id)}><span>{emoji(r.name)}</span><span className="truncate">{r.name}</span>{catCounts[r.id]>0&&<span className="ml-auto shrink-0 text-[11px]" style={{color:"var(--mut)"}}>{catCounts[r.id]}</span>}</button>
              {(selected===r.slug||selectedCategory?.parent_id===r.id)&&children(r.id).length>0&&<div className="ml-6 mt-1 grid gap-0.5">{children(r.id).map(c=><button type="button" key={c.id} onClick={()=>setSelected(c.slug)} className="min-h-[36px] rounded-lg px-2 text-left text-xs" style={{color:selected===c.slug?"var(--gold)":"var(--mut)",background:selected===c.slug?"rgba(245,166,35,.1)":"transparent"}}><span className="flex items-center gap-2"><span className="truncate">{c.name}</span>{catCounts[c.id]>0&&<span className="ml-auto shrink-0">{catCounts[c.id]}</span>}</span></button>)}</div>}</div>)}</div>
          </div>
          <div><div className="mb-2 text-sm font-semibold">Lokalizacja</div><input list="sm-regions" value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Miasto lub województwo" className="min-h-[44px] w-full rounded-xl px-3 text-sm outline-none" style={{border:"1px solid var(--line)",background:"rgba(255,255,255,.04)",color:"var(--ink)"}} aria-label="Lokalizacja"/><datalist id="sm-regions">{REGIONS.map(r=><option key={r} value={r}/>)}</datalist></div>
          <div><div className="mb-2 text-sm font-semibold">Cena</div><div className="grid grid-cols-2 gap-2"><Field label="Od"><input type="number" min="0" value={priceMin} onChange={e=>setPriceMin(e.target.value)} placeholder="zł"/></Field><Field label="Do"><input type="number" min="0" value={priceMax} onChange={e=>setPriceMax(e.target.value)} placeholder="zł"/></Field></div>
            {/* Gotowe widełki — skracają drogę do wyniku (makiety 2026-09-10). */}
            <div className="mt-2 grid grid-cols-2 gap-2">{([["","500","Do 500 zł"],["500","1500","500 – 1 500 zł"],["1500","3000","1 500 – 3 000 zł"],["3000","","Powyżej 3 000 zł"]] as [string,string,string][]).map(([lo,hi,label])=>{const on=priceMin===lo&&priceMax===hi;return <button type="button" key={label} onClick={()=>{if(on){setPriceMin("");setPriceMax("");}else{setPriceMin(lo);setPriceMax(hi);}setAutoRun(true);}} className="min-h-[36px] rounded-lg px-2 text-xs font-semibold" style={chip(on)}>{label}</button>;})}</div></div>
          {defs.length>0&&<div><div className="mb-2 text-sm font-semibold">Szczegóły</div><div className="grid gap-2">{defs.map(d=><DynamicField key={d.key} def={d} value={filters[d.key]??""} onChange={v=>setFilter(d.key,v)}/>)}</div></div>}
          {loadingFilters&&<div className="text-xs" style={{color:"var(--mut)"}}>Pobieram filtry dla tej kategorii…</div>}
          <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl font-bold" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)",color:"#101012"}}><Ico name="search" size={18} strokeWidth={2.2}/>{busy?"Szukam…":"Pokaż oferty"}</button>
        </form>
      </aside>

      {/* ── Wyniki ─────────────────────────────────────────── */}
      <section className="min-w-0">
        {/* Telefon: pole wyszukiwania nad wynikami (nagłówek mobilny nie ma wyszukiwarki) */}
        <SearchBox value={q} onChange={setQ} onSubmit={()=>setAutoRun(true)} className="mb-4 flex items-center gap-1 rounded-2xl lg:hidden" style={box} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl font-bold">{title}</h1><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{subtitle}</p></div>
          <div className="flex w-full items-center gap-2 sm:w-auto"><button type="button" onClick={()=>{setShowFilters(v=>!v); if(!showFilters) setTimeout(()=>document.getElementById("filtry")?.scrollIntoView({behavior:"smooth",block:"start"}),50);}} className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold lg:hidden" style={box} aria-expanded={showFilters} aria-controls="filtry">☰ Filtry</button><ViewToggle value={view} onChange={setView} /><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-sm sm:flex-none" style={box}><span className="shrink-0" style={{color:"var(--mut)"}}>Sortowanie</span><select value={sort} onChange={e=>setSort(e.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold outline-none" style={{color:"var(--ink)"}}><option value="trafnosc">Najtrafniejsze</option><option value="najnowsze">Najnowsze</option><option value="popularne">Najczęściej oglądane</option><option value="cena_rosnaco">Cena: rosnąco</option><option value="cena_malejaco">Cena: malejąco</option></select></label></div>
        </div>
        <ActiveFilterChips items={[
          ...(q.trim()?[{key:"q",label:`„${q.trim()}”`,clear:()=>{setQ("");setAutoRun(true);}}]:[]),
          ...(mode?[{key:"mode",label:MODE_FILTERS.find(m=>m.id===mode)?.label||mode,clear:()=>{setMode("");setAutoRun(true);}}]:[]),
          ...(selectedCategory?[{key:"kat",label:selectedCategory.name,clear:()=>{setSelected("");setFilters({});setDefs([]);setAutoRun(true);}}]:[]),
          ...(loc.trim()?[{key:"loc",label:`📍 ${loc.trim()}`,clear:()=>{setLoc("");setAutoRun(true);}}]:[]),
          ...((priceMin||priceMax)?[{key:"price",label:`${priceMin?`od ${priceMin} zł`:""}${priceMin&&priceMax?" ":""}${priceMax?`do ${priceMax} zł`:""}`,clear:()=>{setPriceMin("");setPriceMax("");setAutoRun(true);}}]:[]),
          ...Object.entries(filters).filter(([,v])=>v!==""&&v!==false).map(([k,v])=>({key:k,label:`${defs.find(d=>d.key===k)?.label||k}${v===true?"":`: ${v}`}`,clear:()=>{setFilter(k,"");setAutoRun(true);}})),
        ]} onClearAll={()=>{reset();setAutoRun(true);}} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rows.length>0&&<div className="text-sm" style={{color:"var(--mut)"}}>Znaleziono <b style={{color:"var(--ink)"}}>{rows.length}</b> {rows.length===1?"ofertę":rows.length<5?"oferty":"ofert"}</div>}
          <SavedSearchButton name={[q.trim(),selectedCategory?.name,loc.trim()].filter(Boolean).join(" · ")||title} query={q.trim()} categorySlug={selected} priceMin={priceMin?Number(priceMin):null} priceMax={priceMax?Number(priceMax):null} filters={(()=>{const f:Record<string,string|boolean>={};for(const [k,v] of Object.entries(filters)) if(v!==""&&v!==false) f[k]=v; if(mode) f.purchase_mode=mode; if(loc.trim()) f.location=loc.trim(); return f;})()} />
        </div>
        {false&&<div className="mt-4 text-sm" style={{color:"var(--mut)"}}>Znaleziono <b style={{color:"var(--ink)"}}>{rows.length}</b> {rows.length===1?"ofertę":rows.length<5?"oferty":"ofert"}</div>}
        {msg&&<div className="mt-5 rounded-2xl p-6 text-sm" style={{...box,color:"var(--mut)"}}>{msg}</div>}
        {rows.length===0&&!msg&&!busy&&<div className="mt-5 rounded-2xl p-6 text-sm" style={{...box,color:"var(--mut)"}}>Wpisz frazę w wyszukiwarce albo wybierz kategorię w <b style={{color:"var(--ink)"}}>Filtrach</b>.</div>}
        {busy&&rows.length===0&&<div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={box}/>)}</div>}
        {rows.length>0&&<div className={view==="list"?"mt-4 grid gap-3":"mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4"}>{rows.map(o=>{const action=resultMode(o);const href=action.booking?offerDetailHref(o.offer_id,true):`/produkt/${o.offer_id}`;const loc=typeof o.attributes?.location==="string"?o.attributes.location:null;const rad=Number(o.attributes?.service_radius_km)||0;const pm=String(o.attributes?.purchase_mode||"");return <a href={href} key={o.offer_id} className={`group overflow-hidden rounded-2xl transition hover:-translate-y-0.5 ${view==="list"?"flex":"flex flex-col"}`} style={box}><div className={view==="list"?"relative aspect-[4/3] w-32 shrink-0 overflow-hidden sm:w-56":"relative aspect-[4/3] overflow-hidden"} style={{background:"var(--header)"}}>{o.image_url?<img src={o.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"/>:<div className="grid h-full place-items-center text-5xl">{emoji(o.category||o.category_slug||"")}</div>}{action.booking&&<span className="absolute left-3 top-3 rounded-lg px-2 py-1 text-[11px] font-semibold backdrop-blur" style={{background:"rgba(11,11,13,.75)",border:"1px solid rgba(255,255,255,.15)",color:"#fff"}}>{action.label}</span>}</div><div className="flex flex-1 flex-col p-3 sm:p-4"><div className="text-base font-bold sm:text-lg" style={{color:"var(--gold)"}}>{zl(o.price_gross)}{pm==="daily"&&<span className="text-xs font-medium" style={{color:"var(--mut)"}}> / dobę</span>}{pm==="appointment"&&<span className="text-xs font-medium" style={{color:"var(--mut)"}}> / termin</span>}</div><div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{o.title}</div><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{color:"var(--mut)"}}>{o.category&&<span className="rounded-md px-2 py-0.5" style={{background:"rgba(255,255,255,.06)",border:"1px solid var(--line)",color:"var(--ink)"}}>{o.category}</span>}<span className="truncate">{loc?`📍 ${loc}${rad?rad>=600?" · cała Polska":` · +${rad} km`:""}`:o.seller}</span>{timeAgo(o.created_at)&&<span className="ml-auto shrink-0">🕒 {timeAgo(o.created_at)}</span>}</div><div className="mt-auto pt-3"><div className="flex h-10 items-center justify-center rounded-xl text-sm font-semibold" style={action.booking?{background:"linear-gradient(135deg,#E8891A,#F5A623)",color:"#101012"}:{border:"1px solid var(--line)",color:"var(--ink)"}}>{action.cta} →</div></div></div></a>;})}</div>}
      </section>
    </div>
    </div>
    <HomeFooter />
  </main>;
}

function CategoryOptions({root,categories}:{root:Category;categories:Category[]}){
  const kids=categories.filter(c=>c.parent_id===root.id);
  return <><option value={root.slug}>{root.name}</option>{kids.map(k=><CategoryOptionBranch key={k.id} item={k} categories={categories} depth={1}/>)}</>;
}
function CategoryOptionBranch({item,categories,depth}:{item:Category;categories:Category[];depth:number}){
  const kids=categories.filter(c=>c.parent_id===item.id);
  return <><option value={item.slug}>{`${"— ".repeat(depth)}${item.name}`}</option>{kids.map(k=><CategoryOptionBranch key={k.id} item={k} categories={categories} depth={depth+1}/>)}</>;
}
function DynamicField({def,value,onChange}:{def:AttrDef;value:string|boolean;onChange:(v:string|boolean)=>void}){
  const options=normalizeOptions(def.options);
  if(def.data_type==="bool") return <label className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm" style={{border:"1px solid var(--line)"}}><input type="checkbox" checked={value===true} onChange={e=>onChange(e.target.checked)}/><span>{def.label}</span></label>;
  if(def.data_type==="enum"&&options.length) return <Field label={def.label}><select value={String(value||"")} onChange={e=>onChange(e.target.value)}><option value="">Dowolne</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</select></Field>;
  if(def.data_type==="number") return <Field label={def.label}><input type="number" value={String(value||"")} onChange={e=>onChange(e.target.value)}/></Field>;
  return <Field label={def.label}><input value={String(value||"")} onChange={e=>onChange(e.target.value)}/></Field>;
}
function Field({label,children}:{label:string;children:React.ReactElement}){return <label className="block text-sm"><span className="mb-1 block text-xs" style={{color:"var(--mut)"}}>{label}</span><div className="[&_input]:w-full [&_select]:w-full [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:px-3 [&_select]:px-3 [&_input]:py-2.5 [&_select]:py-2.5 [&_input]:outline-none [&_select]:outline-none [&_input]:bg-transparent [&_select]:bg-transparent [&_input]:min-h-[44px] [&_select]:min-h-[44px]" style={{border:"1px solid var(--line)",borderRadius:12,background:"rgba(255,255,255,.04)"}}>{children}</div></label>;
}