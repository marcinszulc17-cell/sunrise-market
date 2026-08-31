import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Offer = { offer_id:string; title:string; price_gross:number; category:string; category_slug:string; seller:string; image_url:string|null; attributes:Record<string,any> };
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

  useEffect(()=>{
    supabase.from("categories").select("id,slug,name,parent_id,sort_order").order("sort_order").order("name")
      .then(({data})=>setCategories((data||[]) as Category[]));
  },[]);

  const selectedCategory=useMemo(()=>categories.find(c=>c.slug===selected)||null,[categories,selected]);
  const roots=useMemo(()=>categories.filter(c=>!c.parent_id),[categories]);
  const children=(id:string)=>categories.filter(c=>c.parent_id===id);

  useEffect(()=>{
    setFilters({}); setDefs([]);
    if(!selectedCategory?.id) return;
    let alive=true; setLoadingFilters(true);
    supabase.from("category_attributes").select("key,label,data_type,options").eq("category_id",selectedCategory.id).order("label")
      .then(({data})=>{ if(alive){setDefs(((data||[]) as AttrDef[]).filter(d=>!PRIVATE_FILTER_KEYS.has(d.key)));setLoadingFilters(false);} },()=>{if(alive){setDefs([]);setLoadingFilters(false);}});
    return()=>{alive=false;};
  },[selectedCategory?.id]);

  function setFilter(key:string,value:string|boolean){setFilters(prev=>({...prev,[key]:value}));}

  async function search(e?:FormEvent){
    e?.preventDefault(); setBusy(true); setMsg(null);
    const rpcFilters:Record<string,string|boolean>={};
    for(const [k,v] of Object.entries(filters)) if(v!==""&&v!==false) rpcFilters[k]=v;
    if(mode) rpcFilters.purchase_mode=mode;
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

  function reset(){setQ("");setPriceMin("");setPriceMax("");setSort("trafnosc");setSelected("");setMode("");setFilters({});setDefs([]);setRows([]);setMsg(null);}

  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex items-center gap-3"><a href="/" className="text-sm">← Market</a><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>SUNRISE MARKET</div><h1 className="text-3xl font-semibold">Wyszukiwarka zaawansowana</h1><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Produkty, usługi, rezerwacje, wynajem, samochody, nieruchomości i wszystkie pozostałe kategorie w jednym miejscu.</p></div></div>

    <section className="mb-5 rounded-3xl p-4 sm:p-5" style={box}>
      <div className="mb-3 flex items-center justify-between gap-3"><b>Wybierz dział</b>{selected&&<button type="button" onClick={()=>{setSelected("");setFilters({});setDefs([]);}} className="text-xs" style={{color:"var(--gold)"}}>Wszystkie kategorie</button>}</div>
      <div className="flex gap-2 overflow-x-auto pb-2"><button type="button" onClick={()=>setSelected("")} className="shrink-0 rounded-xl px-4 py-3 text-sm font-semibold" style={!selected?{background:"linear-gradient(135deg,#C8965A,#E8C896)",color:"#000"}:box}>☰ Wszystko</button>{roots.map(r=><button type="button" key={r.id} onClick={()=>setSelected(r.slug)} className="shrink-0 rounded-xl px-4 py-3 text-sm font-semibold" style={selected===r.slug?{background:"linear-gradient(135deg,#C8965A,#E8C896)",color:"#000"}:box}>{emoji(r.name)} {r.name}</button>)}</div>
      {selectedCategory&&children(selectedCategory.id).length>0&&<div className="mt-3 flex gap-2 overflow-x-auto border-t pt-3" style={{borderColor:"var(--line)"}}>{children(selectedCategory.id).map(c=><button type="button" key={c.id} onClick={()=>setSelected(c.slug)} className="shrink-0 rounded-xl px-3 py-2 text-sm" style={selected===c.slug?{background:"rgba(200,150,90,.18)",border:"1px solid var(--gold)"}:box}>{c.name}</button>)}</div>}
    </section>

    <section className="mb-5 rounded-3xl p-4 sm:p-5" style={box}>
      <div className="mb-3"><b>Jak chcesz skorzystać?</b><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>Ten filtr działa w każdej kategorii — także dla aut, nieruchomości, sprzętu i usług.</div></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{MODE_FILTERS.map(item=><button type="button" key={item.id||"all"} onClick={()=>setMode(item.id)} className="rounded-2xl px-4 py-3 text-left" style={mode===item.id?{background:"rgba(200,150,90,.16)",border:"1px solid var(--gold)"}:box}><div className="font-semibold">{item.icon} {item.label}</div><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>{item.description}</div></button>)}</div>
    </section>

    <form onSubmit={search} className="rounded-3xl p-5 sm:p-6" style={box}><div className="grid gap-3 md:grid-cols-4">
      <Field label="Szukaj"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Czego szukasz?"/></Field>
      <Field label="Kategoria"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Wszystkie kategorie</option>{roots.map(r=><CategoryOptions key={r.id} root={r} categories={categories}/>)}</select></Field>
      <Field label="Cena od"><input type="number" min="0" value={priceMin} onChange={e=>setPriceMin(e.target.value)}/></Field>
      <Field label="Cena do"><input type="number" min="0" value={priceMax} onChange={e=>setPriceMax(e.target.value)}/></Field>
      <Field label="Sortowanie"><select value={sort} onChange={e=>setSort(e.target.value)}><option value="trafnosc">Trafność</option><option value="cena_rosnaco">Cena: rosnąco</option><option value="cena_malejaco">Cena: malejąco</option><option value="najnowsze">Najnowsze</option></select></Field>
      {defs.map(d=><DynamicField key={d.key} def={d} value={filters[d.key]??""} onChange={v=>setFilter(d.key,v)}/>) }
    </div>
    {loadingFilters&&<div className="mt-4 text-sm" style={{color:"var(--mut)"}}>Pobieram filtry dla tej kategorii…</div>}
    {selectedCategory&&!loadingFilters&&defs.length===0&&<div className="mt-4 text-sm" style={{color:"var(--mut)"}}>Ta kategoria nie wymaga dodatkowych filtrów. Możesz wyszukiwać po nazwie i cenie.</div>}
    <div className="mt-5 flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{busy?"Szukam…":"Pokaż oferty"}</button><button type="button" onClick={reset} className="rounded-xl px-4 py-3 text-sm" style={box}>Wyczyść</button></div></form>

    {msg&&<div className="mt-5 text-sm" style={{color:"var(--mut)"}}>{msg}</div>}
    {rows.length>0&&<section className="mt-7"><div className="mb-4 text-sm" style={{color:"var(--mut)"}}>Znaleziono: {rows.length}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rows.map(o=><a href={`/produkt/${o.offer_id}`} key={o.offer_id} className="overflow-hidden rounded-2xl" style={box}><div className="h-44 overflow-hidden" style={{background:"var(--glass)"}}>{o.image_url?<img src={o.image_url} alt={o.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-5xl">{emoji(o.category||o.category_slug||"")}</div>}</div><div className="p-4"><div className="text-xs" style={{color:"var(--mut)"}}>{o.category}</div><div className="mt-1 font-semibold">{o.title}</div><div className="mt-2 text-2xl font-bold">{zl(o.price_gross)}</div></div></a>)}</div></section>}
  </div></main>;
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
function Field({label,children}:{label:string;children:React.ReactElement}){return <label className="text-sm"><span className="mb-1 block" style={{color:"var(--mut)"}}>{label}</span><div className="[&_input]:w-full [&_select]:w-full [&_input]:rounded-xl [&_select]:rounded-xl [&_input]:px-3 [&_select]:px-3 [&_input]:py-2.5 [&_select]:py-2.5 [&_input]:outline-none [&_select]:outline-none [&_input]:bg-transparent [&_select]:bg-transparent" style={{border:"1px solid var(--line)",borderRadius:12}}>{children}</div></label>}