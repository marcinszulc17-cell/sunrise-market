import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer, offerImages } from "../lib/api";
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
  const { id } = useParams();
  const [offer,setOffer]=useState<PrivateOffer|null>(null);
  const [imgs,setImgs]=useState<string[]>([]);
  const [active,setActive]=useState(0);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{
    if(!id) return;
    Promise.all([getOffer(id),offerImages(id)])
      .then(([o,images])=>{setOffer(o as PrivateOffer);setImgs(images||[]);})
      .catch(e=>setErr((e as Error).message))
      .finally(()=>setLoading(false));
  },[id]);

  function buyNow(){
    if(!offer || offer.stock<=0) return;
    addToCart({offer_id:offer.offer_id,title:offer.title,price:offer.price_gross});
    window.location.href="/koszyk";
  }

  if(loading) return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--mut)"}}>Ładowanie…</main>;
  if(err || !offer) return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--ink)"}}>Nie udało się wczytać oferty.</main>;

  const A=offer.attributes||{};
  const main=imgs[active]||offer.image_url;
  return <div className="min-h-screen" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <header className="sticky top-0 z-20 backdrop-blur" style={{background:"var(--header)",borderBottom:"1px solid var(--line)"}}>
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3"><a href="/"><img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-8 w-auto rounded-lg bg-white p-1"/></a><div className="flex-1"/><button onClick={()=>history.back()} className="text-sm">← Wróć</button></div>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <div className="grid gap-7 md:grid-cols-2">
        <div>
          <div className="grid aspect-square max-h-[560px] place-items-center overflow-hidden rounded-3xl" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>{main?<img src={main} alt={offer.title} className="h-full w-full object-cover"/>:<span className="text-7xl">📦</span>}</div>
          {imgs.length>1&&<div className="mt-3 flex gap-2 overflow-x-auto">{imgs.map((u,i)=><button key={`${u}-${i}`} onClick={()=>setActive(i)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl" style={{border:active===i?"2px solid var(--gold)":"1px solid var(--line)"}}><img src={u} alt="" className="h-full w-full object-cover"/></button>)}</div>}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{background:"rgba(200,150,90,.12)",color:"var(--gold)",border:"1px solid rgba(200,150,90,.25)"}}>Sprzedający prywatny</span><span className="text-xs" style={{color:"var(--mut)"}}>{offer.category}</span></div>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{offer.title}</h1>
          <div className="font-display text-4xl font-bold">{zl(offer.price_gross)}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {A.condition&&<span className="rounded-xl px-3 py-2" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>Stan: <b>{conditionLabel[A.condition]||A.condition}</b></span>}
            {A.delivery&&<span className="rounded-xl px-3 py-2" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>🚚 {deliveryLabel[A.delivery]||A.delivery}</span>}
          </div>
          <div className="rounded-2xl p-4 text-sm" style={{background:"rgba(122,184,154,.08)",border:"1px solid rgba(122,184,154,.2)"}}><b>{offer.seller}</b><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>Oferta osoby prywatnej w Sunrise Market.</div></div>
          {offer.description&&<div className="rounded-2xl p-4 text-sm leading-6" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--mut)"}}>{offer.description}</div>}
          <div className="flex flex-wrap gap-2">{["Ochrona płatności","Sunrise Pay","Cashback na portfel"].map(x=><span key={x} className="rounded-lg px-2.5 py-1 text-xs" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--mut)"}}>✓ {x}</span>)}</div>
          <button onClick={buyNow} disabled={offer.stock<=0} className="mt-2 w-full rounded-2xl py-4 text-lg font-bold text-black disabled:cursor-not-allowed disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{offer.stock>0?"Kup teraz":"Oferta niedostępna"}</button>
          <p className="text-center text-xs" style={{color:"var(--mut)"}}>Stała cena. Bez negocjacji i bez kontaktu przed zakupem.</p>
        </div>
      </div>
    </main>
  </div>;
}
