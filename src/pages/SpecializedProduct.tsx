import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer, offerImages, trackView, similarOffers } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { pushRecent } from "../lib/recent";
import { displayImageUrl } from "../lib/imageUrl";

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
const PRIVATE_KEYS = new Set(["vin", "registration_number", "offer_type", "cashback_only", "purchase_mode"]);

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
  const details = Object.entries(A).filter(([k, v]) => v !== null && v !== "" && v !== false && !BOOLEAN_LABELS[k] && !PRIVATE_KEYS.has(k) && !["colors","sizes","features","packing","video"].includes(k));
  const mainImage = imgs[active] || o?.image_url || null;
  const isCar = kind === "car";
  const isProperty = kind === "property";

  async function sendLead(e: FormEvent) {
    e.preventDefault();
    if (!o) return;
    setLeadError(null);
    setLeadBusy(true);
    const { error } = await supabase.rpc("create_offer_lead", {
      p_offer: o.offer_id,
      p_name: leadName,
      p_email: leadEmail || null,
      p_phone: leadPhone || null,
      p_message: leadMessage || `Zapytanie dotyczące oferty: ${o.title}`,
    });
    setLeadBusy(false);
    if (error) { setLeadError(error.message); return; }
    setLeadDone(true);
  }

  if (loading) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  if (err || !o) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>Nie udało się wczytać oferty.</main>;

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <a href="/"><img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-8 rounded-lg bg-white p-1" /></a>
        <div className="flex-1" />
        <button onClick={() => navigator.share?.({ title: o.title, url: window.location.href })} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Udostępnij</button>
        <a href="/" className="text-sm">← Wróć</a>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div className="mb-4 text-sm" style={{ color: "var(--mut)" }}>{o.category} · {o.seller}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section>
          <div className="overflow-hidden rounded-3xl" style={{ border: "1px solid var(--line)", background: "var(--glass)" }}>
            {mainImage ? <img src={displayImageUrl(mainImage,1800)} alt={o.title} className="h-[430px] w-full object-cover sm:h-[540px]" /> : <div className="grid h-[430px] place-items-center text-8xl">{isCar ? "🚗" : isProperty ? "🏠" : "🌅"}</div>}
          </div>
          {imgs.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{imgs.map((u,i) => <button key={u} onClick={() => setActive(i)} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: active===i ? "2px solid var(--gold)" : "1px solid var(--line)" }}><img src={displayImageUrl(u,320)} className="h-full w-full object-cover" alt="" /></button>)}</div>}

          {heroStats.length > 0 && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{heroStats.map(([k,v]) => <div key={k} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{k}</div><div className="mt-1 font-semibold">{v}</div></div>)}</div>}

          {isCar && A.vin && <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background:"rgba(56,224,240,.07)", border:"1px solid rgba(56,224,240,.20)" }}><b>VIN:</b> dostępny do weryfikacji w Sunrise Verify. Pełny numer nie jest publikowany w ogłoszeniu.</div>}

          {bools.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Najważniejsze cechy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{bools.map(([k]) => <div key={k} className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}>✓ {BOOLEAN_LABELS[k]}</div>)}</div></section>}

          {details.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">{isCar ? "Dane pojazdu" : isProperty ? "Dane nieruchomości" : "Szczegóły"}</h2><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{details.map(([k,v],i) => <div key={k} className="grid grid-cols-[140px_1fr] gap-4 px-4 py-3 text-sm" style={{ background: i%2 ? "transparent" : "var(--glass)", borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--mut)" }}>{LABELS[k] || k.split("_").join(" ")}</span><span className="font-medium">{(k === "mileage_km" || k === "mileage") ? `${Number(v).toLocaleString("pl-PL")} km` : k === "area_m2" ? `${v} m²` : k === "rent_pln" ? `${Number(v).toLocaleString("pl-PL")} zł` : String(v)}</span></div>)}</div></section>}

          {o.description && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Opis</h2><div className="space-y-4 leading-7">{o.description.split(/\n\s*\n/).filter(Boolean).map((p,i)=><p key={i}>{p.trim()}</p>)}</div></section>}
        </section>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-3xl p-5 sm:p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <h1 className="text-3xl font-semibold leading-tight">{o.title}</h1>
            <div className="mt-5 text-4xl font-bold">{zl(o.price_gross)}</div>
            {isProperty && A.area_m2 && <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{Math.round(o.price_gross / Number(A.area_m2)).toLocaleString("pl-PL")} zł/m²</div>}
            <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>Cashback po zakupie</div><div className="mt-1 text-2xl font-bold" style={{ color: "var(--green)" }}>+{cashback.toLocaleString("pl-PL")} pkt</div></div>
            {A.full_vat_invoice && <div className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: "rgba(56,224,240,.10)", border: "1px solid rgba(56,224,240,.25)" }}>✓ Pełna faktura VAT</div>}
            {A.location && <div className="mt-4 text-sm">📍 {A.location}</div>}

            {(isCar || isProperty) && <div className="mt-4 rounded-2xl p-4" style={{background:"rgba(200,150,90,.08)",border:"1px solid rgba(200,150,90,.22)"}}><div className="font-semibold">🛡 Sunrise Verify</div><div className="mt-1 text-xs leading-5" style={{color:"var(--mut)"}}>{isCar?"Historia pojazdu, szkody, przebieg i zgodność danych — moduł przygotowany pod zewnętrzne źródła B2B.":"Weryfikacja księgi wieczystej i analiza obciążeń — moduł przygotowany do uruchomienia jako płatna usługa."}</div><div className="mt-2 text-xs font-semibold" style={{color:"var(--gold)"}}>Wkrótce w Sunrise Market</div></div>}

            <div className="mt-5 grid gap-2">
              <button onClick={() => { setLeadOpen(true); setLeadDone(false); setLeadError(null); }} className="rounded-2xl py-3 text-center font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Zapytaj o ofertę</button>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="rounded-2xl py-3 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Kopiuj link do ogłoszenia</button>
            </div>
            <div className="mt-5 text-xs leading-5" style={{ color: "var(--mut)" }}>Sprzedawca: <b style={{ color: "var(--ink)" }}>{o.seller}</b><br/>Oferta w Sunrise Market. Przy zakupie obowiązują warunki wskazane przez sprzedawcę.</div>
          </div>
        </aside>
      </div>

      {similar.length > 0 && <section className="mt-12"><h2 className="mb-4 text-2xl font-semibold">Podobne oferty</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{similar.map((s:any)=><a key={s.offer_id} href={`/produkt/${s.offer_id}`} className="overflow-hidden rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="h-44 overflow-hidden">{s.image_url ? <img src={displayImageUrl(s.image_url,700)} className="h-full w-full object-cover" alt={s.title}/> : <div className="grid h-full place-items-center text-4xl">🌅</div>}</div><div className="p-4"><div className="font-semibold">{s.title}</div><div className="mt-2 text-xl font-bold">{zl(s.price_gross)}</div></div></a>)}</div></section>}
    </main>

    {leadOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e)=>{if(e.target===e.currentTarget)setLeadOpen(false)}}><div className="w-full max-w-lg rounded-3xl p-6" style={{background:"var(--bg)",border:"1px solid var(--line)"}}>{leadDone?<><div className="text-4xl">✅</div><h2 className="mt-3 text-2xl font-semibold">Zapytanie wysłane</h2><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>Sprzedawca otrzyma je w swoim panelu Sunrise Market.</p><button onClick={()=>setLeadOpen(false)} className="mt-5 rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Gotowe</button></>:<form onSubmit={sendLead}><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold" style={{color:"var(--gold)"}}>SUNRISE MARKET</div><h2 className="mt-1 text-2xl font-semibold">Zapytaj o ofertę</h2><p className="mt-1 text-sm" style={{color:"var(--mut)"}}>{o.title}</p></div><button type="button" onClick={()=>setLeadOpen(false)} className="text-2xl">×</button></div><div className="mt-5 grid gap-3"><input required minLength={2} value={leadName} onChange={e=>setLeadName(e.target.value)} placeholder="Imię i nazwisko" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><div className="grid gap-3 sm:grid-cols-2"><input value={leadPhone} onChange={e=>setLeadPhone(e.target.value)} placeholder="Telefon" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><input type="email" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} placeholder="E-mail" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/></div><textarea rows={4} value={leadMessage} onChange={e=>setLeadMessage(e.target.value)} placeholder="Wiadomość do sprzedawcy" className="rounded-xl px-3 py-3 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)"}}/><div className="text-xs" style={{color:"var(--mut)"}}>Podaj przynajmniej telefon lub e-mail. Dane służą wyłącznie do obsługi tego zapytania.</div>{leadError&&<div className="text-sm" style={{color:"#ef4444"}}>{leadError}</div>}<button disabled={leadBusy || (!leadPhone.trim()&&!leadEmail.trim())} className="rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>{leadBusy?"Wysyłam…":"Wyślij zapytanie"}</button></div></form>}</div></div>}
  </div>;
}
