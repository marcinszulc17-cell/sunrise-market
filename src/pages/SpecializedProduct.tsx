import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer, offerImages, trackView, similarOffers } from "../lib/api";
import { zl } from "../lib/money";
import { pushRecent } from "../lib/recent";

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
  brand: "Marka", model: "Model", year: "Rok", mileage_km: "Przebieg", fuel: "Paliwo", engine_cc: "Pojemność", power_hp: "Moc", gearbox: "Skrzynia biegów", doors: "Drzwi", seats: "Miejsca", first_registration: "Pierwsza rejestracja", vin: "VIN", location: "Lokalizacja", condition: "Stan", body_type: "Nadwozie", color: "Kolor", registration_number: "Nr rejestracyjny",
  area_m2: "Powierzchnia", market_type: "Rynek", ownership: "Forma własności", rooms: "Pokoje", floor: "Piętro", rent_pln: "Czynsz", heating: "Ogrzewanie", year_built: "Rok budowy",
};
const BOOLEAN_LABELS: Record<string, string> = {
  accident_free: "Bezwypadkowy", first_owner: "Pierwszy właściciel", serviced: "Serwisowany", heated_seats: "Podgrzewane fotele", electric_mirrors: "Elektryczne lusterka", air_conditioning: "Klimatyzacja", financing_available: "Finansowanie", balcony: "Balkon / taras", parking: "Miejsce parkingowe", full_vat_invoice: "Pełna faktura VAT",
};

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
  const heroStats = useMemo(() => {
    if (!o) return [] as Array<[string,string]>;
    if (kind === "car") return [
      ["Rok", A.year], ["Przebieg", A.mileage_km ? `${Number(A.mileage_km).toLocaleString("pl-PL")} km` : ""], ["Paliwo", A.fuel], ["Moc", A.power_hp ? `${A.power_hp} KM` : ""], ["Skrzynia", A.gearbox], ["Silnik", A.engine_cc ? `${A.engine_cc} cm³` : ""],
    ].filter((x): x is [string,string] => Boolean(x[1]));
    if (kind === "property") return [
      ["Powierzchnia", A.area_m2 ? `${A.area_m2} m²` : ""], ["Pokoje", A.rooms], ["Piętro", A.floor], ["Rynek", A.market_type], ["Lokalizacja", A.location], ["Rok budowy", A.year_built],
    ].filter((x): x is [string,string] => Boolean(x[1]));
    return [["Lokalizacja", A.location], ["Kategoria", o.category]].filter((x): x is [string,string] => Boolean(x[1]));
  }, [o, A, kind]);

  const bools = Object.entries(BOOLEAN_LABELS).filter(([k]) => A[k] === true);
  const details = Object.entries(A).filter(([k, v]) => v !== null && v !== "" && v !== false && !BOOLEAN_LABELS[k] && !["colors","sizes","features","packing","video"].includes(k));
  const mainImage = imgs[active] || o?.image_url || null;
  const isCar = kind === "car";
  const isProperty = kind === "property";

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
            {mainImage ? <img src={mainImage} alt={o.title} className="h-[430px] w-full object-cover sm:h-[540px]" /> : <div className="grid h-[430px] place-items-center text-8xl">{isCar ? "🚗" : isProperty ? "🏠" : "🌅"}</div>}
          </div>
          {imgs.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{imgs.map((u,i) => <button key={u} onClick={() => setActive(i)} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: active===i ? "2px solid var(--gold)" : "1px solid var(--line)" }}><img src={u} className="h-full w-full object-cover" alt="" /></button>)}</div>}

          {heroStats.length > 0 && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{heroStats.map(([k,v]) => <div key={k} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{k}</div><div className="mt-1 font-semibold">{v}</div></div>)}</div>}

          {bools.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Najważniejsze cechy</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{bools.map(([k]) => <div key={k} className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}>✓ {BOOLEAN_LABELS[k]}</div>)}</div></section>}

          {details.length > 0 && <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">{isCar ? "Dane pojazdu" : isProperty ? "Dane nieruchomości" : "Szczegóły"}</h2><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{details.map(([k,v],i) => <div key={k} className="grid grid-cols-[140px_1fr] gap-4 px-4 py-3 text-sm" style={{ background: i%2 ? "transparent" : "var(--glass)", borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--mut)" }}>{LABELS[k] || k.split("_").join(" ")}</span><span className="font-medium">{k === "mileage_km" ? `${Number(v).toLocaleString("pl-PL")} km` : k === "area_m2" ? `${v} m²` : k === "rent_pln" ? `${Number(v).toLocaleString("pl-PL")} zł` : String(v)}</span></div>)}</div></section>}

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

            <div className="mt-5 grid gap-2">
              <a href={`mailto:?subject=${encodeURIComponent(o.title)}&body=${encodeURIComponent(window.location.href)}`} className="rounded-2xl py-3 text-center font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Zapytaj o ofertę</a>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="rounded-2xl py-3 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Kopiuj link do ogłoszenia</button>
            </div>
            <div className="mt-5 text-xs leading-5" style={{ color: "var(--mut)" }}>Sprzedawca: <b style={{ color: "var(--ink)" }}>{o.seller}</b><br/>Oferta w Sunrise Market. Przy zakupie obowiązują warunki wskazane przez sprzedawcę.</div>
          </div>
        </aside>
      </div>

      {similar.length > 0 && <section className="mt-12"><h2 className="mb-4 text-2xl font-semibold">Podobne oferty</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{similar.map((s:any)=><a key={s.offer_id} href={`/produkt/${s.offer_id}`} className="overflow-hidden rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="h-44 overflow-hidden">{s.image_url ? <img src={s.image_url} className="h-full w-full object-cover" alt={s.title}/> : <div className="grid h-full place-items-center text-4xl">🌅</div>}</div><div className="p-4"><div className="font-semibold">{s.title}</div><div className="mt-2 text-xl font-bold">{zl(s.price_gross)}</div></div></a>)}</div></section>}
    </main>
  </div>;
}
