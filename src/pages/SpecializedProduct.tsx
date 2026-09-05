import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ShareOfferButton from "../components/ShareOfferButton";
import { useParams } from "react-router-dom";
import { getOffer, offerImages, trackView, similarOffers } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { pushRecent } from "../lib/recent";
import { displayImageUrl } from "../lib/imageUrl";
import OfferDescription from "../components/OfferDescription";
import { addToCart } from "../lib/cart";

type Offer = {
  offer_id: string;
  title: string;
  description: string | null;
  price_gross: number;
  stock: number;
  status: string;
  category: string;
  category_slug: string;
  seller: string;
  seller_id: string;
  image_url: string | null;
  attributes?: Record<string, any> | null;
};

const LABELS: Record<string, string> = {
  brand: "Marka", model: "Model", year: "Rok", mileage_km: "Przebieg", mileage: "Przebieg", fuel: "Paliwo", engine_cc: "Pojemność", engine: "Pojemność", power_hp: "Moc", power: "Moc", gearbox: "Skrzynia biegów", doors: "Drzwi", seats: "Miejsca", first_registration: "Pierwsza rejestracja", location: "Lokalizacja", condition: "Stan", body_type: "Nadwozie", color: "Kolor",
  area_m2: "Powierzchnia", market_type: "Rynek", ownership: "Forma własności", rooms: "Pokoje", floor: "Piętro", rent_pln: "Czynsz", heating: "Ogrzewanie", year_built: "Rok budowy",
};
const BOOLEAN_LABELS: Record<string, string> = {
  accident_free: "Bezwypadkowy", first_owner: "Pierwszy właściciel", serviced: "Serwisowany", heated_seats: "Podgrzewane fotele", electric_mirrors: "Elektryczne lusterka", air_conditioning: "Klimatyzacja", financing_available: "Finansowanie", balcony: "Balkon / taras", parking: "Miejsce parkingowe", full_vat_invoice: "Pełna faktura VAT",
};
// Klucze techniczne (sync MySunrise, promocje, flagi) — nie są danymi oferty i nie pokazujemy ich klientowi.
const PRIVATE_KEYS = new Set(["vin", "registration_number", "offer_type", "cashback_only", "purchase_mode", "source", "enriched", "ms_stock", "own_brand", "mysunrise_id", "mysunrise_sku", "subscription", "promo", "price_locked", "private_listing", "buy_now_only", "specs", "images", "gallery", "seo", "sync"]);

function kindOf(slug: string) {
  if (slug.includes("motoryzacja-samochody-osobowe")) return "car";
  if (slug.startsWith("nieruchomosci-")) return "property";
  if (slug.startsWith("uslugi-")) return "service";
  return "local";
}

export default function SpecializedProduct() {
  const { id } = useParams();
  const [o, setO] = useState<Offer | null>(null);
  const [imgs, setImgs] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [similar, setSimilar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const swipeStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((d: any) => {
      setO(d);
      pushRecent({ offer_id: d.offer_id, title: d.title, price_gross: d.price_gross, image_url: d.image_url });
    }).catch((e) => setErr(String(e?.message || e))).finally(() => setLoading(false));
    offerImages(id).then((u) => { setImgs(u); setActive(0); }).catch(() => {});
    similarOffers(id, 6).then(setSimilar).catch(() => {});
    trackView(id);
  }, [id]);

  const A = o?.attributes || {};
  const kind = kindOf(o?.category_slug || "");
  const cashback = o ? Math.round(o.price_gross * 0.03) : 0;
  const mileage = A.mileage_km ?? A.mileage;
  const power = A.power_hp ?? A.power;
  const engine = A.engine_cc ?? A.engine;
  const heroStats = useMemo(() => {
    if (!o) return [] as Array<[string,string]>;
    if (kind === "car") return [
      ["Rok", A.year], ["Przebieg", mileage ? `${Number(mileage).toLocaleString("pl-PL")} km` : ""], ["Paliwo", A.fuel], ["Moc", power ? `${power} KM` : ""], ["Skrzynia", A.gearbox], ["Silnik", engine ? `${engine} cm³` : ""],
    ].filter((x): x is [string,string] => Boolean(x[1]));
    if (kind === "property") return [
      ["Powierzchnia", A.area_m2 ? `${A.area_m2} m²` : ""], ["Pokoje", A.rooms], ["Piętro", A.floor], ["Rynek", A.market_type], ["Lokalizacja", A.location], ["Rok budowy", A.year_built],
    ].filter((x): x is [string,string] => Boolean(x[1]));
    return [["Lokalizacja", A.location], ["Kategoria", o.category]].filter((x): x is [string,string] => Boolean(x[1]));
  }, [o, A, kind, mileage, power, engine]);

  const bools = Object.entries(BOOLEAN_LABELS).filter(([k]) => A[k] === true);
  const details = Object.entries(A).filter(([k, v]) => v !== null && v !== "" && v !== false && typeof v !== "object" && !BOOLEAN_LABELS[k] && !PRIVATE_KEYS.has(k) && !["colors","sizes","features","packing","video"].includes(k));
  const mainImage = imgs[active] || o?.image_url || null;
  const isCar = kind === "car";
  const isProperty = kind === "property";
  // Ochrona Kupujących: każda oferta z ceną kupowalna przez Sunrise (poza rezerwacjami i nieruchomościami).
  const canBuy = Boolean(o && o.price_gross > 0 && !isProperty && !["appointment", "daily"].includes(String(A.purchase_mode || "")));
  function buyViaSunrise() {
    if (!o) return;
    addToCart({ offer_id: o.offer_id, title: o.title, price: o.price_gross });
    window.location.href = "/koszyk";
  }

  function resetZoom() { setZoom(1); setPan({ x: 0, y: 0 }); }
  function choosePhoto(index: number) { if (!imgs.length) return; const next = ((index % imgs.length) + imgs.length) % imgs.length; setActive(next); resetZoom(); }
  function nextPhoto() { if (imgs.length > 1) choosePhoto(active + 1); }
  function prevPhoto() { if (imgs.length > 1) choosePhoto(active - 1); }
  function changeZoom(next: number) { const value = Math.min(5, Math.max(1, next)); setZoom(value); if (value === 1) setPan({ x: 0, y: 0 }); }

  async function sendLead(e: FormEvent) {
    e.preventDefault(); if (!o) return; setLeadError(null); setLeadBusy(true);
    const { error } = await supabase.rpc("create_offer_lead", { p_offer: o.offer_id, p_name: leadName, p_email: leadEmail || null, p_phone: leadPhone || null, p_message: leadMessage || `Zapytanie dotyczące oferty: ${o.title}` });
    setLeadBusy(false); if (error) { setLeadError(error.message); return; } setLeadDone(true);
  }

  if (loading) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  if (err || !o) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>Nie udało się wczytać oferty.</main>;

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3"><a href="/"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" /></a><div className="flex-1" /><button onClick={() => navigator.share?.({ title: o.title, url: window.location.href })} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Udostępnij</button><a href="/" className="text-sm">← Wróć</a></div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div className="mb-4 text-sm" style={{ color: "var(--mut)" }}>{o.category} · {o.seller}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section>
          <div className="group relative overflow-hidden rounded-3xl" style={{ border: "1px solid var(--line)", background: "rgba(0,0,0,.16)" }} onTouchStart={(e)=>{ swipeStartX.current=e.touches[0]?.clientX ?? null; }} onTouchEnd={(e)=>{ const start=swipeStartX.current; const end=e.changedTouches[0]?.clientX; swipeStartX.current=null; if(start===null || end===undefined) return; const dx=end-start; if(Math.abs(dx)>45) dx<0?nextPhoto():prevPhoto(); }}>
            {mainImage ? <button type="button" onClick={()=>{setLightboxOpen(true);resetZoom();}} className="block w-full cursor-zoom-in"><img src={displayImageUrl(mainImage,1800)} alt={o.title} className="h-[430px] w-full object-contain sm:h-[540px]" /></button> : <div className="grid h-[430px] place-items-center text-8xl">{isCar ? "🚗" : isProperty ? "🏠" : "🌅"}</div>}
            {imgs.length>1&&<><button type="button" aria-label="Poprzednie zdjęcie" onClick={prevPhoto} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 px-4 py-3 text-2xl text-white opacity-90 backdrop-blur transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100">‹</button><button type="button" aria-label="Następne zdjęcie" onClick={nextPhoto} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 px-4 py-3 text-2xl text-white opacity-90 backdrop-blur transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100">›</button><div className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">{active+1}/{imgs.length}</div></>}
            {mainImage&&<div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">Kliknij, aby powiększyć</div>}
          </div>
          {imgs.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{imgs.map((u,i) => <button key={u} onClick={() => choosePhoto(i)} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: active===i ? "2px solid var(--gold)" : "1px solid var(--line)", background:"rgba(0,0,0,.16)" }}><img src={displayImageUrl(u,320)} className="h-full w-full object-contain" alt="" /></button>)}</div>}
          {heroStats.length > 0 && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{heroStats.map(([k,v]) => <div key={k} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{k}</div><div className="mt-1 font-semibold">{v}</div></div>)}</div>}
          {isCar && A.vin && <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background:"rgba(56,224,240,.07)", border:"1px solid rgba(56,224,240,.20)" }}><b>VIN:</b> dostępny do weryfikacji w Sunrise Verify. Pełny numer nie jest publikowany w ogłoszeniu.</div>}
          {bools.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Najważniejsze cechy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{bools.map(([k]) => <div key={k} className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}>✓ {BOOLEAN_LABELS[k]}</div>)}</div></section>}
          {details.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">{isCar ? "Dane pojazdu" : isProperty ? "Dane nieruchomości" : "Szczegóły"}</h2><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{details.map(([k,v],i) => <div key={k} className="grid grid-cols-[140px_1fr] gap-4 px-4 py-3 text-sm" style={{ background: i%2 ? "transparent" : "var(--glass)", borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--mut)" }}>{LABELS[k] || k.split("_").join(" ")}</span><span className="font-medium">{(k === "mileage_km" || k === "mileage") ? `${Number(v).toLocaleString("pl-PL")} km` : k === "area_m2" ? `${v} m²` : k === "rent_pln" ? `${Number(v).toLocaleString("pl-PL")} zł` : String(v)}</span></div>)}</div></section>}
          {o.description && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Opis</h2><OfferDescription value={o.description} /></section>}
        </section>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-3xl p-5 shadow-2xl sm:p-6" style={{ background: "var(--glass)", border: "1px solid rgba(232,137,26,.22)" }}>
            <div className="text-xs font-semibold tracking-[.14em]" style={{color:"var(--gold)"}}>SUNRISE MARKET</div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">{o.title}</h1>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs" style={{color:"var(--mut)"}}>Cena</div><div className="text-4xl font-bold">{zl(o.price_gross)}</div></div>{A.location&&<div className="rounded-full px-3 py-1 text-xs" style={{background:"var(--header)",border:"1px solid var(--line)"}}>📍 {A.location}</div>}</div>
            {isProperty && A.area_m2 && <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{Math.round(o.price_gross / Number(A.area_m2)).toLocaleString("pl-PL")} zł/m²</div>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl p-4" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>Cashback po zakupie</div><div className="mt-1 text-2xl font-bold" style={{ color: "var(--green)" }}>+{cashback.toLocaleString("pl-PL")} pkt</div></div>
              {A.full_vat_invoice && <div className="rounded-2xl p-4 text-sm font-semibold" style={{ background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.22)" }}><div>✓ Pełna faktura VAT</div><div className="mt-1 text-xs font-normal" style={{color:"var(--mut)"}}>Zakup dokumentowany pełną fakturą VAT.</div></div>}
            </div>

            {(isCar || isProperty) && <div className="mt-4 rounded-2xl p-4" style={{background:"linear-gradient(135deg,rgba(232,137,26,.10),rgba(56,224,240,.05))",border:"1px solid rgba(232,137,26,.25)"}}><div className="flex items-center justify-between gap-3"><div className="font-semibold">🛡 Sunrise Verify</div><span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{background:"rgba(122,184,154,.12)",color:"var(--green)"}}>DOSTĘPNE</span></div><div className="mt-2 text-xs leading-5" style={{color:"var(--mut)"}}>{isCar?"Przed zakupem możesz zamówić dodatkową weryfikację danych pojazdu. Zakres raportu zależy od danych oferty i dostępnych źródeł.":"Przed zakupem możesz zamówić dodatkową analizę danych nieruchomości w zakresie dostępnych źródeł."}</div><div className="mt-2 text-xs font-semibold" style={{color:"var(--gold)"}}>Usługę uruchomisz przy tej ofercie.</div></div>}

            {canBuy && <div className="mt-5">
              <button type="button" onClick={buyViaSunrise} className="w-full rounded-2xl py-3 text-center font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Kup przez Sunrise · Ochrona Kupujących</button>
              <div className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>🛡 Płacisz przez Sunrise. Sprzedający dostaje pieniądze dopiero, gdy potwierdzisz odbiór — inaczej wracają do Ciebie.</div>
            </div>}
            {isProperty && <div className="mt-5 rounded-2xl p-4 text-xs leading-5" style={{ background: "rgba(56,224,240,.07)", border: "1px solid rgba(56,224,240,.20)", color: "var(--mut)" }}>Transakcje nieruchomości finalizowane są u notariusza. Sunrise Verify sprawdzi stan prawny przed spotkaniem.</div>}
            <div className={`${canBuy || isProperty ? "mt-3" : "mt-5"} grid gap-2`}><button onClick={() => { setLeadOpen(true); setLeadDone(false); setLeadError(null); }} className="rounded-2xl py-3 text-center font-semibold" style={canBuy ? { border: "1px solid rgba(232,137,26,.45)", color: "var(--gold)" } : { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#000" }}>Zapytaj sprzedawcę</button><ShareOfferButton offerId={String(id)} title={o.title} className="rounded-2xl py-3 text-sm font-semibold" style={{ border: "1px solid var(--line)" }} /></div>
            <div className="mt-5 rounded-2xl p-4 text-xs leading-5" style={{ background:"var(--header)", color: "var(--mut)", border:"1px solid var(--line)" }}><div className="font-semibold" style={{color:"var(--ink)"}}>{o.seller}</div><div className="mt-1">Sprzedawca odpowiada za warunki konkretnej oferty. Płatność, rezerwacja i historia transakcji są obsługiwane w Sunrise Market tam, gdzie dana oferta je udostępnia.</div></div>
          </div>
        </aside>
      </div>

      {similar.length > 0 && <section className="mt-12"><h2 className="mb-4 text-2xl font-semibold">Podobne oferty</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{similar.map((s:any)=><a key={s.offer_id} href={`/produkt/${s.offer_id}`} className="overflow-hidden rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="h-44 overflow-hidden" style={{background:"rgba(0,0,0,.16)"}}>{s.image_url ? <img src={displayImageUrl(s.image_url,720)} className="h-full w-full object-contain" alt={s.title}/> : <div className="grid h-full place-items-center text-4xl">🌅</div>}</div><div className="p-4"><div className="font-semibold">{s.title}</div><div className="mt-2 text-xl font-bold">{zl(s.price_gross)}</div></div></a>)}</div></section>}
    </main>

    {lightboxOpen && mainImage && <div className="fixed inset-0 z-[70] bg-black/95" onMouseDown={(e)=>{if(e.target===e.currentTarget){setLightboxOpen(false);resetZoom();}}}>
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 p-2 text-white backdrop-blur"><button type="button" onClick={()=>changeZoom(zoom-0.5)} className="rounded-full px-4 py-2 text-xl" aria-label="Pomniejsz">−</button><button type="button" onClick={resetZoom} className="min-w-16 rounded-full px-3 py-2 text-sm">{Math.round(zoom*100)}%</button><button type="button" onClick={()=>changeZoom(zoom+0.5)} className="rounded-full px-4 py-2 text-xl" aria-label="Powiększ">+</button></div>
      <button type="button" onClick={()=>{setLightboxOpen(false);resetZoom();}} className="absolute right-4 top-4 z-20 rounded-full bg-black/70 px-4 py-2 text-2xl text-white" aria-label="Zamknij">×</button>
      {imgs.length>1&&<><button type="button" onClick={prevPhoto} className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 px-5 py-4 text-3xl text-white">‹</button><button type="button" onClick={nextPhoto} className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 px-5 py-4 text-3xl text-white">›</button><div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm text-white">{active+1}/{imgs.length}</div></>}
      <div className="flex h-full w-full touch-none items-center justify-center overflow-hidden" style={{cursor:zoom>1?(dragging?"grabbing":"grab"):"zoom-in"}} onWheel={(e)=>{e.preventDefault();changeZoom(zoom+(e.deltaY<0?0.25:-0.25));}} onDoubleClick={()=>changeZoom(zoom===1?2.5:1)} onPointerDown={(e)=>{ if(zoom<=1) return; setDragging(true); dragStart.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y}; e.currentTarget.setPointerCapture?.(e.pointerId); }} onPointerMove={(e)=>{ if(!dragging || zoom<=1) return; setPan({x:dragStart.current.panX+(e.clientX-dragStart.current.x),y:dragStart.current.panY+(e.clientY-dragStart.current.y)}); }} onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)}><img src={displayImageUrl(mainImage,2500,2000)} alt={o.title} draggable={false} className="max-h-[92vh] max-w-[96vw] select-none object-contain transition-transform duration-100" style={{transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}} /></div>
    </div>}

    {leadOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e)=>{if(e.target===e.currentTarget)setLeadOpen(false)}}><div className="w-full max-w-lg rounded-3xl p-6" style={{background:"var(--bg)",border:"1px solid var(--line)"}}>{leadDone?<><div className="text-4xl">✅</div><h2 className="mt-3 text-2xl font-semibold">Zapytanie wysłane</h2><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>Sprzedawca otrzyma je w swoim panelu Sunrise Market.</p><button onClick={()=>setLeadOpen(false)} className="mt-5 rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Gotowe</button></>:<form onSubmit={sendLead}><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>SUNRISE MARKET</div><h2 className="mt-1 text-2xl font-semibold">Zapytaj o ofertę</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{o.title}</p></div><button type="button" onClick={()=>setLeadOpen(false)} className="text-2xl">×</button></div><div className="mt-5 grid gap-3"><input required minLength={2} value={leadName} onChange={e=>setLeadName(e.target.value)} placeholder="Imię i nazwisko" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><div className="grid gap-3 sm:grid-cols-2"><input value={leadPhone} onChange={e=>setLeadPhone(e.target.value)} placeholder="Telefon" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><input type="email" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} placeholder="E-mail" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/></div><textarea rows={4} value={leadMessage} onChange={e=>setLeadMessage(e.target.value)} placeholder="Wiadomość do sprzedawcy" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><div className="text-xs" style={{color:"var(--mut)"}}>Podaj przynajmniej telefon lub e-mail. Dane służą wyłącznie do obsługi tego zapytania.</div>{leadError&&<div className="text-sm" style={{color:"#ef4444"}}>{leadError}</div>}<button disabled={leadBusy || (!leadPhone.trim()&&!leadEmail.trim())} className="rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{leadBusy?"Wysyłam…":"Wyślij zapytanie"}</button></div></form>}</div></div>}
  </div>;
}
