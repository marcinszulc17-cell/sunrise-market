import { useEffect, useState } from "react";
import { SiteHeader } from "../components/home/SiteChrome";

import { useOfferId } from "../lib/offerId";
import { getOffer, offerImages, startConversation } from "../lib/api";
import { addToCart } from "../lib/cart";
import { zl } from "../lib/money";

type PrivateOffer = {
  offer_id: string;
  title: string;
  description: string | null;
  price_gross: number;
  stock: number;
  seller: string;
  image_url: string | null;
  category: string;
  category_slug: string;
  attributes?: {
    seller_nature?: string;
    condition?: string;
    delivery?: string;
    private_listing?: boolean;
    buy_now_only?: boolean;
    offer_type?: string;
    location?: string;
    year?: number;
    mileage_km?: number;
    engine_cc?: number;
    power_hp?: number;
    power_kw?: number;
    fuel?: string;
    transmission?: string;
    has_vin?: boolean;
  } | null;
};

const conditionLabel: Record<string,string> = {
  new: "Nowy",
  very_good: "Bardzo dobry",
  good: "Dobry",
  used: "Używany",
  damaged: "Uszkodzony / do naprawy",
};
const deliveryLabel: Record<string,string> = {
  both: "Wysyłka lub odbiór osobisty",
  shipping: "Wysyłka",
  pickup: "Odbiór osobisty",
};

export default function PrivateProduct(){
  const id = useOfferId();
  const [offer,setOffer]=useState<PrivateOffer|null>(null);
  const [imgs,setImgs]=useState<string[]>([]);
  const [active,setActive]=useState(0);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string|null>(null);
  const [lightbox,setLightbox]=useState(false);
  const [contactBusy,setContactBusy]=useState(false);
  const [touchX,setTouchX]=useState<number|null>(null);

  useEffect(()=>{
    if(!id) return;
    Promise.all([getOffer(id),offerImages(id)])
      .then(([o,images])=>{setOffer(o as PrivateOffer);setImgs(images||[]);})
      .catch(e=>setErr((e as Error).message))
      .finally(()=>setLoading(false));
  },[id]);

  function prevImage(){ setActive((i)=>imgs.length?((i-1+imgs.length)%imgs.length):0); }
  function nextImage(){ setActive((i)=>imgs.length?((i+1)%imgs.length):0); }

  useEffect(()=>{
    if(!lightbox) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") setLightbox(false); if(e.key==="ArrowLeft") prevImage(); if(e.key==="ArrowRight") nextImage(); };
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",onKey);
    return ()=>{ document.body.style.overflow=""; window.removeEventListener("keydown",onKey); };
  },[lightbox,imgs.length]);

  async function contactSeller(){
    if(!offer || contactBusy) return;
    setContactBusy(true); setErr(null);
    try{
      const { supabase } = await import("../lib/supabase");
      const { data:{ session } } = await supabase.auth.getSession();
      if(!session){ window.location.href=`/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      const conv=await startConversation(offer.offer_id,"Dzień dobry, interesuje mnie ta oferta. Czy jest nadal aktualna?");
      window.location.href=`/wiadomosci?w=${encodeURIComponent(conv)}`;
    }catch(e){ setErr((e as Error).message || "Nie udało się rozpocząć rozmowy."); }
    finally{ setContactBusy(false); }
  }

  function buyNow(){
    if(!offer || offer.stock<=0) return;
    addToCart({offer_id:offer.offer_id,title:offer.title,price:offer.price_gross});
    window.location.href="/koszyk";
  }

  if(loading) return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--mut)"}}>Ładowanie…</main>;
  if(err || !offer) return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--ink)"}}>Nie udało się wczytać oferty.</main>;

  const A=offer.attributes||{};
  const main=imgs[active]||offer.image_url;
  const isCar=A.offer_type==="car" || offer.category_slug?.startsWith("motoryzacja-samochody");
  const details = isCar ? [
    ["Rok", A.year],
    ["Przebieg", A.mileage_km ? `${Number(A.mileage_km).toLocaleString("pl-PL")} km` : null],
    ["Silnik", A.engine_cc ? `${(Number(A.engine_cc)/1000).toFixed(1)} l` : null],
    ["Moc", A.power_hp ? `${A.power_hp} KM` : null],
    ["Paliwo", A.fuel==="diesel" ? "Diesel" : A.fuel],
    ["Skrzynia", A.transmission==="automatic" ? "Automatyczna" : A.transmission],
    ["Lokalizacja", A.location],
    ["VIN", A.has_vin ? "Zweryfikowany / ukryty" : null],
  ].filter((x)=>x[1]!==null && x[1]!==undefined && x[1]!=="");
  return <div className="min-h-screen overflow-x-hidden" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <SiteHeader back />
    <main className="mx-auto w-full max-w-5xl min-w-0 overflow-x-hidden px-4 py-6 sm:py-8">
      <div className="grid min-w-0 gap-7 md:grid-cols-2">
        <div className="min-w-0 max-w-full">
          <button type="button" onClick={()=>main&&setLightbox(true)} className={`grid w-full max-w-full ${isCar?"aspect-[3/4]":"aspect-square"} max-h-[680px] place-items-center overflow-hidden rounded-3xl text-left`} style={{background:"var(--glass)",border:"1px solid var(--line)"}} aria-label="Otwórz galerię">{main?<img src={main} alt={offer.title} className="h-full w-full max-w-full object-cover"/>:<span className="text-7xl">📦</span>}</button>
          {imgs.length>1&&<div className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{imgs.map((u,i)=><button key={`${u}-${i}`} onClick={()=>setActive(i)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl" style={{border:active===i?"2px solid var(--gold)":"1px solid var(--line)"}}><img src={u} alt="" className="h-full w-full object-cover"/></button>)}</div>}
        </div>
        <div className="min-w-0 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:"rgba(232,137,26,.12)",color:"var(--gold)",border:"1px solid rgba(232,137,26,.25)"}}>Sprzedający prywatny</span><span className="text-xs" style={{color:"var(--mut)"}}>{offer.category}</span></div>
          <h1 className="break-words font-display text-3xl font-semibold leading-tight sm:text-4xl">{offer.title}</h1>
          <div className="font-display text-4xl font-bold">{zl(offer.price_gross)}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {A.condition&&<span className="rounded-xl px-3 py-2" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>Stan: <b>{conditionLabel[A.condition]||A.condition}</b></span>}
            {A.delivery&&<span className="rounded-xl px-3 py-2" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>🚚 {deliveryLabel[A.delivery]||A.delivery}</span>}
          </div>
          <div className="rounded-2xl p-4 text-sm" style={{background:"rgba(122,184,154,.08)",border:"1px solid rgba(122,184,154,.2)"}}><b>{offer.seller}</b><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>Oferta osoby prywatnej w Sunrise Market.</div></div>
          {details.length>0&&<div className="grid grid-cols-2 gap-2 rounded-2xl p-4 sm:grid-cols-3" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>{details.map(([label,value])=><div key={String(label)} className="rounded-xl p-3" style={{background:"rgba(255,255,255,.035)"}}><div className="text-[11px] uppercase tracking-wide" style={{color:"var(--mut)"}}>{label}</div><div className="mt-1 text-sm font-semibold">{String(value)}</div></div>)}</div>}
          {offer.description&&<div className="whitespace-pre-line rounded-2xl p-4 text-sm leading-6" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--mut)"}}>{offer.description}</div>}
          <div className="flex flex-wrap gap-2">{["Ochrona płatności","Sunrise Pay","Cashback na portfel"].map(x=><span key={x} className="rounded-lg px-2.5 py-1 text-xs" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--mut)"}}>✓ {x}</span>)}</div>
          {isCar ? <>
            <button onClick={contactSeller} disabled={contactBusy} className="mt-2 w-full rounded-2xl py-4 text-lg font-bold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{contactBusy?"Otwieram rozmowę…":"Napisz do sprzedającego"}</button>
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={contactSeller} disabled={contactBusy} className="rounded-2xl py-3 text-sm font-semibold" style={{border:"1px solid var(--line)",background:"var(--glass)"}}>Umów oględziny</button>
              <div className="grid place-items-center rounded-2xl px-3 py-3 text-center text-sm" style={{border:"1px solid var(--line)",background:"var(--glass)",color:"var(--mut)"}}>📍 {A.location||"Lokalizacja u sprzedającego"}</div>
            </div>
            <p className="text-center text-xs leading-5" style={{color:"var(--mut)"}}>Zakup samochodu ustalasz bezpośrednio ze sprzedającym. Sunrise Market nie wymusza płatności „Kup teraz” dla ogłoszenia auta.</p>
          </> : <>
            <button onClick={buyNow} disabled={offer.stock<=0} className="mt-2 w-full rounded-2xl py-4 text-lg font-bold text-black disabled:cursor-not-allowed disabled:opacity-50" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{offer.stock>0?"Kup teraz":"Oferta niedostępna"}</button>
            <p className="text-center text-xs" style={{color:"var(--mut)"}}>Stała cena. Bez negocjacji.</p>
            <p className="text-center text-xs leading-5" style={{color:"var(--mut)"}}>🛡 Płacisz przez Sunrise. Sprzedający dostaje pieniądze dopiero, gdy potwierdzisz odbiór — inaczej wracają do Ciebie.</p>
          </>}
        </div>
      </div>
    </main>
    {lightbox&&main&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3" role="dialog" aria-modal="true" onClick={()=>setLightbox(false)}>
      <button type="button" onClick={()=>setLightbox(false)} className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl text-white" aria-label="Zamknij">×</button>
      {imgs.length>1&&<button type="button" onClick={(e)=>{e.stopPropagation();prevImage();}} className="absolute left-3 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-3xl text-white" aria-label="Poprzednie zdjęcie">‹</button>}
      <div className={`relative ${isCar?"aspect-[3/4]":"aspect-square"} max-h-[88vh] w-auto max-w-[92vw] overflow-hidden rounded-2xl`} onClick={(e)=>e.stopPropagation()} onTouchStart={(e)=>setTouchX(e.touches[0]?.clientX??null)} onTouchEnd={(e)=>{const end=e.changedTouches[0]?.clientX??null;if(touchX!==null&&end!==null&&Math.abs(end-touchX)>40){end<touchX?nextImage():prevImage();}setTouchX(null);}}>
        <img src={main} alt={offer.title} className="h-full w-full select-none object-contain" draggable={false}/>
        {imgs.length>1&&<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{active+1} / {imgs.length}</div>}
      </div>
      {imgs.length>1&&<button type="button" onClick={(e)=>{e.stopPropagation();nextImage();}} className="absolute right-3 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-3xl text-white" aria-label="Następne zdjęcie">›</button>}
    </div>}
  </div>;
}
