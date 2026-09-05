import { useEffect, useRef, useState } from "react";
import { bannersFor, bannerView, bannerClick, homePromoted, sponsoredOffers } from "../lib/api";
import { zl, pkt } from "../lib/money";

type Mode = "car" | "property";
type Ad = { id:string; headline:string; link_url:string; image_url:string|null; seller?:string };
type Offer = { offer_id:string; title:string; price_gross:number; category?:string; category_slug?:string; seller?:string; image_url:string|null; attributes?:Record<string,any> };

const glass: React.CSSProperties = { background:"var(--glass)", border:"1px solid var(--line)", color:"var(--ink)" };

export default function CategoryAds({mode}:{mode:Mode}) {
  const car = mode === "car";
  const dept = car ? "motoryzacja" : "nieruchomosci";
  const [banner,setBanner]=useState<Ad|null>(null);
  const [promoted,setPromoted]=useState<Offer[]>([]);

  useEffect(()=>{
    let alive=true;
    bannersFor("category_top",dept,null).then((rows:any[])=>{if(alive)setBanner((rows||[])[0]||null)}).catch(()=>{});
    Promise.allSettled([homePromoted(), sponsoredOffers()]).then((res)=>{
      if(!alive)return;
      const all:Offer[]=[];
      for(const r of res){ if(r.status==="fulfilled") for(const o of (r.value||[])) if(o?.offer_id&&!all.some(x=>x.offer_id===o.offer_id)) all.push(o); }
      const filtered=all.filter(o=>{
        const slug=String(o.category_slug||"").toLowerCase(); const cat=String(o.category||"").toLowerCase(); const title=String(o.title||"").toLowerCase();
        return car ? (slug.includes("motoryz")||cat.includes("motoryz")||title.includes("samoch")||title.includes("ford")||title.includes("bmw")||title.includes("audi")||title.includes("mercedes")) : (slug.includes("nieruch")||cat.includes("nieruch")||title.includes("mieszkan")||title.includes("dom ")||title.includes("działk")||title.includes("lokal"));
      }).slice(0,8);
      setPromoted(filtered);
    });
    return()=>{alive=false};
  },[mode]);

  return <>
    {banner&&banner.image_url&&<TrackedBanner ad={banner}/>} 
    {promoted.length>0&&<section className="mx-auto max-w-7xl px-4 py-6"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>PROMOWANE</div><h2 className="text-2xl font-semibold">{car?"Wyróżnione samochody":"Wyróżnione nieruchomości"}</h2></div><span className="rounded-full px-3 py-1 text-xs" style={glass}>Reklama / promocja</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{promoted.map(o=><PromoCard key={o.offer_id} o={o} car={car}/>)}</div></section>}
  </>;
}

function TrackedBanner({ad}:{ad:Ad}){
  const ref=useRef<HTMLAnchorElement|null>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;if(typeof IntersectionObserver==="undefined"){bannerView(ad.id);return;}const io=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){bannerView(ad.id);io.disconnect();}},{threshold:.35});io.observe(el);return()=>io.disconnect();},[ad.id]);
  return <section className="mx-auto max-w-7xl px-4 py-4"><a ref={ref} href={ad.link_url||"/"} onClick={()=>bannerClick(ad.id)} className="relative block overflow-hidden rounded-3xl" style={{border:"1px solid var(--line)"}}><img src={ad.image_url!} alt={ad.headline} className="max-h-[300px] w-full object-cover"/><span className="absolute right-3 top-3 rounded-full px-2 py-1 text-[10px]" style={{background:"rgba(0,0,0,.62)",color:"white"}}>reklama</span></a></section>;
}

function PromoCard({o,car}:{o:Offer;car:boolean}){
  const a=o.attributes||{}; const cashback=Math.round(Number(o.price_gross||0)*.03*100)/100;
  const mileage=a.mileage_km||a.mileage; const power=a.power_hp||a.power;
  const meta=car?[a.year,mileage&&`${Number(mileage).toLocaleString("pl-PL")} km`,a.fuel,power&&`${power} KM`]:[a.area_m2&&`${a.area_m2} m²`,a.rooms&&`${a.rooms} pok.`,a.location];
  return <a href={`/produkt/${o.offer_id}`} className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-1" style={glass}><div className="relative h-44 overflow-hidden">{o.image_url?<img src={o.image_url} alt={o.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-5xl">{car?"🚗":"🏠"}</div>}<span className="absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>PROMOWANE</span></div><div className="p-4"><div className="line-clamp-2 font-semibold">{o.title}</div><div className="mt-2 text-2xl font-bold">{zl(o.price_gross)}</div><div className="mt-2 text-xs" style={{color:"var(--mut)"}}>{meta.filter(Boolean).join(" · ")}</div><div className="mt-3 inline-block rounded-full px-2 py-1 text-[11px] font-semibold" style={{background:"rgba(122,184,154,.12)",color:"var(--green)"}}>+{pkt(cashback)} pkt cashback</div></div></a>;
}
