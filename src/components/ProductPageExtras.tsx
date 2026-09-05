import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOffer } from "../lib/api";
import { bookingPublicCatalogV2 } from "../lib/bookingV2";
import { supabase } from "../lib/supabase";

type Reputation={seller_id:string;name:string;rating:number;reviews_count:number;badge:string|null;status:string;reviews:Array<{rating:number;comment:string|null;created_at:string;seller_reply?:string|null}>};

type RentalOperations={
 pickup_location?:string;pickup_time?:string;return_time?:string;handover_instructions?:string;late_return_fee?:number;important_terms?:string;
 included_km_per_day?:number;excess_km_fee?:number;fuel_policy?:string;min_driver_age?:number;min_license_years?:number;extra_driver_fee?:number;insurance_excess?:number;
 kit_contents?:string;condition_return_policy?:string;
};

function money(value:unknown){const n=Number(value||0);return Number.isFinite(n)&&n>0?`${n.toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})} zł`:""}

export default function ProductPageExtras({offerId,verifyKind}:{offerId:string;verifyKind:"vehicle"|"property"|null}){
 const [rep,setRep]=useState<Reputation|null>(null);const [bookable,setBookable]=useState(false);const [bookingType,setBookingType]=useState<"appointment"|"daily"|null>(null);const [offer,setOffer]=useState<any>(null);
 useEffect(()=>{let alive=true;getOffer(offerId).then(async o=>{if(!alive)return;setOffer(o);if(o?.seller_id){const {data}=await supabase.schema("market").rpc("seller_public_reputation",{p_seller:o.seller_id});if(alive&&data)setRep(data as Reputation);}try{const c=await bookingPublicCatalogV2(offerId);if(alive&&c){setBookable(true);setBookingType(c.config.booking_type)}}catch{/* optional */}}).catch(()=>{});return()=>{alive=false}},[offerId]);
 const attrs=offer?.attributes||{};
 const rentalKind=String(attrs.rental_kind||"");
 const ops=(attrs.rental_operations&&typeof attrs.rental_operations==="object"?attrs.rental_operations:{}) as RentalOperations;
 const isRental=bookable&&bookingType==="daily";
 const isCar=isRental&&(rentalKind==="car"||verifyKind==="vehicle"||String(attrs.offer_type||"")==="car_rental");
 const isEquipment=isRental&&(rentalKind==="equipment"||String(attrs.offer_type||"")==="product_rental"||String(attrs.offer_type||"")==="equipment_rental");
 const hasRentalTerms=isRental&&Boolean(ops.pickup_location||ops.pickup_time||ops.return_time||ops.handover_instructions||ops.important_terms||ops.late_return_fee||ops.included_km_per_day||ops.excess_km_fee||ops.fuel_policy||ops.min_driver_age||ops.min_license_years||ops.extra_driver_fee||ops.insurance_excess||ops.kit_contents||ops.condition_return_policy);
 return <section className="mx-auto max-w-7xl px-4 pb-4">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">🛡️</div><div className="mt-3 font-semibold">Bezpieczniejsza decyzja</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>{verifyKind==="vehicle"?"Przed zakupem możesz zamówić Sunrise Verify i sprawdzić dane pojazdu w dostępnych źródłach.":verifyKind==="property"?"Przed zakupem możesz zamówić Sunrise Verify i zlecić dodatkową analizę danych nieruchomości.":"Płatność, historia zamówień i kontakt ze sprzedawcą są obsługiwane w jednym ekosystemie Sunrise Market."}</p>
      </div>
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">💳</div><div className="mt-3 font-semibold">Płatność i cashback</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>{bookable?`Rezerwację ${bookingType==="daily"?"okresu":"terminu"} możesz opłacić online przez Stripe lub Sunrise Pay. Cashback jest pokazywany przy cenie, jeśli oferta go obejmuje.`:"Zakup możesz rozliczyć metodami dostępnymi w checkout. Cashback jest pokazywany przy cenie tylko wtedy, gdy dotyczy tej oferty."}</p>
      </div>
      <div className="rounded-2xl p-5" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
        <div className="text-2xl">🤝</div><div className="mt-3 font-semibold">Wsparcie przed i po zakupie</div>
        <p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>{bookable?bookingType==="daily"?"Wybierasz daty, widzisz czynsz za cały okres i płacisz online. Rezerwacja trafia do kalendarza sprzedawcy.":"Wybierasz usługę, termin i dostępnego pracownika lub zasób, a następnie płacisz online.":"Możesz skontaktować się ze sprzedawcą, obserwować ofertę, porównać ją z innymi i wrócić do historii zamówienia z poziomu konta."}</p>
      </div>
    </div>

    {hasRentalTerms&&<div className="mt-6 rounded-3xl p-6 sm:p-7" style={{background:"rgba(56,224,240,.05)",border:"1px solid rgba(56,224,240,.18)"}}>
      <div><div className="text-xs font-semibold tracking-[.15em]" style={{color:"var(--gold)"}}>WARUNKI WYNAJMU</div><h2 className="mt-1 text-2xl font-semibold">Odbiór, zwrot i najważniejsze zasady</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>Sprawdź te informacje przed wyborem dat i płatnością.</p></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ops.pickup_location&&<Term title={rentalKind==="property"?"Odbiór kluczy / lokalizacja":"Miejsce odbioru"} value={ops.pickup_location}/>} 
        {ops.pickup_time&&<Term title={rentalKind==="property"?"Check-in od":"Odbiór od"} value={ops.pickup_time}/>} 
        {ops.return_time&&<Term title={rentalKind==="property"?"Check-out do":"Zwrot do"} value={ops.return_time}/>} 
        {Number(ops.late_return_fee||0)>0&&<Term title="Spóźniony zwrot" value={`${money(ops.late_return_fee)} / h`}/>} 
        {isCar&&Number(ops.included_km_per_day||0)>0&&<Term title="Kilometry w cenie" value={`${Number(ops.included_km_per_day).toLocaleString("pl-PL")} km / dobę`}/>} 
        {isCar&&Number(ops.excess_km_fee||0)>0&&<Term title="Dodatkowy kilometr" value={money(ops.excess_km_fee)}/>} 
        {isCar&&ops.fuel_policy&&<Term title="Paliwo / ładowanie" value={ops.fuel_policy}/>} 
        {isCar&&Number(ops.min_driver_age||0)>0&&<Term title="Minimalny wiek kierowcy" value={`${Number(ops.min_driver_age)} lat`}/>} 
        {isCar&&Number(ops.min_license_years||0)>0&&<Term title="Wymagane prawo jazdy" value={`minimum ${Number(ops.min_license_years)} ${Number(ops.min_license_years)===1?"rok":"lata"}`}/>} 
        {isCar&&Number(ops.extra_driver_fee||0)>0&&<Term title="Dodatkowy kierowca" value={`${money(ops.extra_driver_fee)} / rezerwację`}/>} 
        {isCar&&Number(ops.insurance_excess||0)>0&&<Term title="Udział własny w szkodzie" value={money(ops.insurance_excess)}/>} 
      </div>
      {(ops.handover_instructions||ops.important_terms||(isEquipment&&ops.kit_contents)||(isEquipment&&ops.condition_return_policy))&&<div className="mt-5 grid gap-4 lg:grid-cols-2">
        {ops.handover_instructions&&<Note title={rentalKind==="property"?"Instrukcja zameldowania i wymeldowania":"Instrukcja odbioru i zwrotu"} text={ops.handover_instructions}/>} 
        {ops.important_terms&&<Note title="Ważne warunki" text={ops.important_terms}/>} 
        {isEquipment&&ops.kit_contents&&<Note title="Co wchodzi w zestaw" text={ops.kit_contents}/>} 
        {isEquipment&&ops.condition_return_policy&&<Note title="Stan i zasady zwrotu" text={ops.condition_return_policy}/>} 
      </div>}
    </div>}

    {rep&&<div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-3xl p-6" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs" style={{color:"var(--mut)"}}>Sprzedawca</div><h2 className="mt-1 text-xl font-semibold">{rep.name||offer?.seller||"Sprzedawca Sunrise Market"}</h2>{rep.badge&&<span className="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{background:"rgba(122,184,154,.12)",color:"var(--green)"}}>{rep.badge}</span>}</div><div className="text-right"><div className="text-2xl font-semibold" style={{color:"var(--gold)"}}>{rep.reviews_count?`${Number(rep.rating).toFixed(1)} ★`:"Nowy"}</div><div className="text-xs" style={{color:"var(--mut)"}}>{rep.reviews_count} opinii</div><Link to={`/sprzedawcy/${rep.seller_id}`} className="mt-2 inline-block text-xs font-semibold" style={{color:"var(--gold)"}}>Zobacz profil i wszystkie opinie →</Link></div></div>{rep.reviews?.length>0&&<div className="mt-4 grid gap-2 sm:grid-cols-2">{rep.reviews.slice(0,2).map((rv,i)=><div key={i} className="rounded-xl p-3 text-sm" style={{background:"var(--header)",border:"1px solid var(--line)"}}><div style={{color:"var(--gold)"}}>{"★".repeat(Math.max(1,Math.min(5,Number(rv.rating||0))))}</div><p className="mt-1 line-clamp-3" style={{color:"var(--mut)"}}>{rv.comment||"Ocena po zakupie"}</p>{rv.seller_reply&&<p className="mt-2 line-clamp-2 text-xs" style={{color:"var(--mut)"}}><span style={{color:"var(--gold)"}}>Odpowiedź sprzedawcy:</span> {rv.seller_reply}</p>}</div>)}</div>}</div>
      <div className="rounded-3xl p-6" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><h2 className="text-xl font-semibold">Warunki tej oferty</h2><div className="mt-4 space-y-3 text-sm"><Row icon="🧾" text={attrs.full_vat_invoice?"Pełna faktura VAT":"Dokument sprzedaży zgodnie z warunkami sprzedawcy"}/><Row icon={bookable?"📅":"💳"} text={bookable?(bookingType==="daily"?"Rezerwacja dat i płatność online":"Rezerwacja usługi/terminu i płatność online"):"Płatność w checkout Sunrise Market"}/><Row icon="🛡" text={verifyKind?"Sunrise Verify dostępny dla tej kategorii":"Ochrona procesu zakupowego w Sunrise Market"}/></div></div>
    </div>}

    <div className="mt-6 rounded-3xl p-6 sm:p-7" style={{background:"linear-gradient(135deg,rgba(232,137,26,.12),rgba(56,224,240,.07))",border:"1px solid rgba(232,137,26,.24)"}}>
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="text-xs font-semibold tracking-[.16em]" style={{color:"var(--gold)"}}>SUNRISE MARKET</div><h2 className="mt-2 text-2xl font-semibold">Więcej niż zwykłe ogłoszenie</h2><p className="mt-2 max-w-3xl text-sm leading-6" style={{color:"var(--mut)"}}>Zakup, rezerwacja, kontakt ze sprzedawcą, cashback, porównanie ofert i narzędzia weryfikacyjne są połączone w jednym procesie.</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><a href="/szukaj" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>Zobacz inne oferty</a><a href="/konto" className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Moje konto</a></div></div>
    </div>
  </section>;
}
function Row({icon,text}:{icon:string;text:string}){return <div className="flex gap-3"><span>{icon}</span><span>{text}</span></div>}
function Term({title,value}:{title:string;value:string}){return <div className="rounded-xl p-3" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="text-xs" style={{color:"var(--mut)"}}>{title}</div><div className="mt-1 font-medium">{value}</div></div>}
function Note({title,text}:{title:string;text:string}){return <div className="rounded-2xl p-4" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="font-semibold">{title}</div><p className="mt-2 whitespace-pre-line text-sm leading-6" style={{color:"var(--mut)"}}>{text}</p></div>}
