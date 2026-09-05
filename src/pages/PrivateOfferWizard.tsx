import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { childCategories, configureBookingOffer, topCategories, uploadProductImage } from "../lib/api";
import { RADIUS_OPTIONS, radiusLabel, serviceAreaAttrs } from "../lib/serviceArea";

type Cat = { id: string; slug: string; name: string };
type Delivery = "shipping" | "pickup" | "both";
type Condition = "new" | "very_good" | "good" | "used" | "damaged";
type PurchaseMode = "purchase" | "appointment" | "daily";
type RentalKind = "product" | "car" | "property";

const field = "w-full rounded-2xl px-4 py-3 outline-none";
const fieldStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };
const DRAFT_KEY = "sunrise_market_private_offer_draft_v2";

const RENTAL_KINDS: Array<{ id: RentalKind; icon: string; title: string; root?: string }> = [
  { id: "product", icon: "🧰", title: "Produkt / sprzęt" },
  { id: "car", icon: "🚗", title: "Auto", root: "motoryzacja" },
  { id: "property", icon: "🏠", title: "Nieruchomość", root: "nieruchomosci" },
];

export default function PrivateOfferWizard() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const rawMode = sp.get("mode");
  const mode: PurchaseMode = rawMode === "appointment" || rawMode === "daily" ? rawMode : "purchase";
  const [rentalKind, setRentalKind] = useState<RentalKind>("product");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState(""); // miejscowość (attributes.location)
  const [radiusKm, setRadiusKm] = useState(0); // dojazd do klienta (attributes.service_radius_km + service_lat/lon)
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<Condition>("good");
  const [delivery, setDelivery] = useState<Delivery>("both");
  const [referrals, setReferrals] = useState(true);
  const [d1, setD1] = useState<Cat[]>([]);
  const [d2, setD2] = useState<Cat[]>([]);
  const [d3, setD3] = useState<Cat[]>([]);
  const [s1, setS1] = useState<Cat | null>(null);
  const [s2, setS2] = useState<Cat | null>(null);
  const [s3, setS3] = useState<Cat | null>(null);
  const chosen = s3 ?? s2 ?? s1;

  const copy = useMemo(() => {
    if (mode === "appointment") return {
      title: "Wystaw usługę na termin",
      subtitle: "Klient wybierze dzień i godzinę, a potem zapłaci za rezerwację.",
      itemLabel: "Jaką usługę oferujesz?",
      placeholder: "Np. montaż klimatyzacji, masaż, konsultacja",
      priceLabel: "Cena usługi",
      publishLabel: "Dalej: ustaw kalendarz",
    };
    if (mode === "daily") return {
      title: "Wystaw wynajem",
      subtitle: "Klient wybierze daty od–do, zobaczy czynsz za cały okres i od razu zapłaci.",
      itemLabel: "Co wynajmujesz?",
      placeholder: rentalKind === "car" ? "Np. Toyota Corolla Hybrid" : rentalKind === "property" ? "Np. Apartament nad morzem" : "Np. agregat, kamera, rower elektryczny",
      priceLabel: "Cena za dobę",
      publishLabel: "Dalej: ustaw kalendarz i kaucję",
    };
    return {
      title: "Wystaw przedmiot",
      subtitle: "Stała cena i jeden prosty zakup: Kup teraz.",
      itemLabel: "Co sprzedajesz?",
      placeholder: "Np. iPhone 15 Pro 256 GB",
      priceLabel: "Cena",
      publishLabel: "Opublikuj ofertę",
    };
  }, [mode, rentalKind]);

  useEffect(() => {
    topCategories().then(x => setD1(x as Cat[])).catch(() => setD1([]));
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && (!d.mode || d.mode === mode)) {
        setTitle(d.title || ""); setDescription(d.description || ""); setPrice(d.price || "");
        setCondition(d.condition || "good"); setDelivery(d.delivery || "both");
        setReferrals(d.referrals !== false); setRentalKind(d.rentalKind || "product");
        setImages(Array.isArray(d.images) ? d.images : []);
      }
    } catch { /* ignore */ }
  }, [mode]);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, rentalKind, title, description, price, condition, delivery, referrals, images })), 250);
    return () => clearTimeout(t);
  }, [mode, rentalKind, title, description, price, condition, delivery, referrals, images]);

  useEffect(() => {
    if (!d1.length) return;
    const rootSlug = mode === "appointment" ? "uslugi-i-reklama" : mode === "daily" ? RENTAL_KINDS.find(x => x.id === rentalKind)?.root : undefined;
    if (!rootSlug) return;
    const root = d1.find(x => x.slug === rootSlug);
    if (!root || s1?.id === root.id) return;
    setS1(root); setS2(null); setS3(null); setD3([]);
    childCategories(root.id).then(x => setD2(x as Cat[])).catch(() => setD2([]));
  }, [d1, mode, rentalKind, s1?.id]);

  async function pick1(slug: string) {
    const c = d1.find(x => x.slug === slug) ?? null;
    setS1(c); setS2(null); setS3(null); setD2([]); setD3([]);
    if (c) setD2(await childCategories(c.id) as Cat[]);
  }
  async function pick2(slug: string) {
    const c = d2.find(x => x.slug === slug) ?? null;
    setS2(c); setS3(null); setD3([]);
    if (c) setD3(await childCategories(c.id) as Cat[]);
  }
  function pick3(slug: string) { setS3(d3.find(x => x.slug === slug) ?? null); }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setMsg(null);
    try {
      const picked = Array.from(files).slice(0, Math.max(0, 12 - images.length));
      const next: string[] = [];
      for (const f of picked) next.push(await uploadProductImage(f));
      setImages(prev => [...prev, ...next].slice(0, 12));
    } catch (e) { setMsg("Nie udało się dodać zdjęcia: " + (e as Error).message); }
    finally { setUploading(false); }
  }

  async function publish() {
    if (!images.length) { setMsg("Dodaj przynajmniej jedno zdjęcie."); return; }
    if (!title.trim()) { setMsg(mode === "appointment" ? "Wpisz nazwę usługi." : "Wpisz nazwę oferty."); return; }
    if (!chosen) { setMsg("Wybierz kategorię."); return; }
    if (!(Number(price) > 0)) { setMsg("Podaj cenę większą od 0 zł."); return; }
    setBusy(true); setMsg(null);
    try {
      const offerType = mode === "appointment" ? "service" : mode === "daily" ? `${rentalKind}_rental` : "product";
      const { data, error } = await supabase.rpc("create_offer_v2", {
        p_title: title.trim(),
        p_description: description.trim(),
        p_price: Number(price),
        p_stock: 1,
        p_category_slug: chosen.slug,
        p_image_urls: images,
        p_commission_model: referrals ? "mlm_full" : "cashback_only",
        p_attributes: {
          seller_nature: "private",
          condition: mode === "appointment" ? null : condition,
          delivery: mode === "purchase" ? delivery : null,
          negotiable: false,
          purchase_mode: mode,
          offer_type: offerType,
          rental_kind: mode === "daily" ? rentalKind : null,
          private_listing: true,
          buy_now_only: mode === "purchase",
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(await serviceAreaAttrs(location, radiusKm)),
        },
      });
      if (error) throw error;
      const id = String(data || "");
      if (!id) throw new Error("Oferta powstała, ale nie otrzymano jej ID.");
      localStorage.removeItem(DRAFT_KEY);

      if (mode !== "purchase") {
        await configureBookingOffer({
          offerId: id,
          bookingType: mode === "daily" ? "daily" : "appointment",
          durationMinutes: mode === "appointment" ? 60 : null,
          slotIntervalMinutes: 30,
          minNoticeHours: 2,
          maxAdvanceDays: 365,
          maxUnits: mode === "daily" ? 60 : 1,
          pricePerUnit: Number(price),
          active: false,
        });
        navigate(`/sprzedawca/rezerwacje/ustawienia/${id}?new=1`, { replace: true });
        return;
      }

      navigate(`/sprzedawca/oferty/${id}/edytuj?new=1`, { replace: true });
    } catch (e) { setMsg("Nie udało się opublikować: " + (e as Error).message); }
    finally { setBusy(false); }
  }

  const forcedRoot = mode === "appointment" || (mode === "daily" && rentalKind !== "product");

  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>SPRZEDAWCA</div><h1 className="mt-1 text-3xl font-semibold">{copy.title}</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{copy.subtitle}</p></div>
        <Link to="/sprzedawca/wystaw" className="text-sm underline" style={{ color: "var(--mut)" }}>Zmień tryb</Link>
      </div>

      {msg && <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(232,137,26,.12)", border: "1px solid rgba(232,137,26,.24)", color: "var(--gold)" }}>{msg}</div>}

      <section className="space-y-6 rounded-3xl p-5 sm:p-7" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        {mode === "daily" && <div>
          <h2 className="mb-3 text-lg font-semibold">1. Co chcesz wynajmować?</h2>
          <div className="grid gap-2 sm:grid-cols-3">{RENTAL_KINDS.map(k => <button type="button" key={k.id} onClick={() => { setRentalKind(k.id); setS1(null); setS2(null); setS3(null); setD2([]); setD3([]); }} className="rounded-2xl p-4 text-left" style={{ background: rentalKind === k.id ? "rgba(232,137,26,.14)" : "var(--header)", border: rentalKind === k.id ? "1px solid var(--gold)" : "1px solid var(--line)" }}><div className="text-2xl">{k.icon}</div><div className="mt-2 text-sm font-semibold">{k.title}</div></button>)}</div>
        </div>}

        <div>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">{mode === "daily" ? "2" : "1"}. Zdjęcia</h2><span className="text-xs" style={{ color: "var(--mut)" }}>{images.length}/12</span></div>
          <label className="flex min-h-32 cursor-pointer items-center justify-center rounded-2xl border border-dashed text-center text-sm font-semibold" style={{ borderColor: "var(--line)", background: "var(--header)" }}>
            <div><div className="text-3xl">📷</div><div className="mt-2">{uploading ? "Dodaję zdjęcia…" : images.length ? "+ Dodaj kolejne" : "Dodaj zdjęcia"}</div><div className="mt-1 text-xs font-normal" style={{ color: "var(--mut)" }}>Pierwsze będzie zdjęciem głównym</div></div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
          </label>
          {images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, i) => <div key={`${url}-${i}`} className="relative"><img src={url} alt="" className="aspect-square w-full rounded-xl object-cover"/><button type="button" onClick={() => setImages(p => p.filter((_,j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">×</button>{i===0 && <span className="absolute bottom-1 left-1 rounded-lg bg-black/70 px-2 py-1 text-[10px] text-white">Główne</span>}</div>)}</div>}
        </div>

        <div><h2 className="mb-3 text-lg font-semibold">{mode === "daily" ? "3" : "2"}. {copy.itemLabel}</h2><input className={field} style={fieldStyle} placeholder={copy.placeholder} value={title} onChange={e=>setTitle(e.target.value)} /><input className={`${field} mt-2`} style={fieldStyle} placeholder="Miejscowość, np. Nowy Tomyśl" value={location} onChange={e=>setLocation(e.target.value)} aria-label="Miejscowość" />{location.trim() && <select className={`${field} mt-2`} style={fieldStyle} value={radiusKm} onChange={e=>setRadiusKm(Number(e.target.value))} aria-label="Dojazd do klienta">{RADIUS_OPTIONS.map(km => <option key={km} value={km}>{radiusLabel(km)}</option>)}</select>}</div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">{mode === "daily" ? "4" : "3"}. Kategoria</h2>
          <div className="grid gap-2 sm:grid-cols-3"><select disabled={forcedRoot} className={field} style={{...fieldStyle, opacity: forcedRoot ? .75 : 1}} value={s1?.slug || ""} onChange={e=>pick1(e.target.value)}><option value="">Dział</option>{d1.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>{d2.length>0 && <select className={field} style={fieldStyle} value={s2?.slug || ""} onChange={e=>pick2(e.target.value)}><option value="">Kategoria</option>{d2.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}{d3.length>0 && <select className={field} style={fieldStyle} value={s3?.slug || ""} onChange={e=>pick3(e.target.value)}><option value="">Podkategoria</option>{d3.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {mode !== "appointment" && <label><span className="mb-2 block text-sm font-semibold">Stan</span><select className={field} style={fieldStyle} value={condition} onChange={e=>setCondition(e.target.value as Condition)}><option value="new">Nowy</option><option value="very_good">Bardzo dobry</option><option value="good">Dobry</option><option value="used">Używany</option><option value="damaged">Uszkodzony / do naprawy</option></select></label>}
          <label><span className="mb-2 block text-sm font-semibold">{copy.priceLabel}</span><div className="relative"><input inputMode="decimal" type="number" min="0" step="0.01" className={field} style={{...fieldStyle,paddingRight:52}} placeholder="0" value={price} onChange={e=>setPrice(e.target.value)} /><span className="absolute right-4 top-3.5 text-sm" style={{color:"var(--mut)"}}>zł</span></div></label>
        </div>

        <label><span className="mb-2 block text-sm font-semibold">Opis <span className="font-normal" style={{color:"var(--mut)"}}>(opcjonalnie)</span></span><textarea rows={5} className={field} style={fieldStyle} placeholder={mode === "appointment" ? "Opisz usługę, zakres i przygotowanie do wizyty…" : mode === "daily" ? "Opisz zasady wynajmu, wyposażenie i ważne informacje…" : "Napisz krótko, w jakim jest stanie i co warto wiedzieć…"} value={description} onChange={e=>setDescription(e.target.value)} /></label>

        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "purchase" && <label><span className="mb-2 block text-sm font-semibold">Dostawa</span><select className={field} style={fieldStyle} value={delivery} onChange={e=>setDelivery(e.target.value as Delivery)}><option value="both">Wysyłka lub odbiór</option><option value="shipping">Tylko wysyłka</option><option value="pickup">Tylko odbiór osobisty</option></select></label>}
          <div className={mode === "purchase" ? "pt-1 sm:pt-7" : ""}><Toggle label="Pozwól zarabiać na poleceniu" checked={referrals} onChange={setReferrals}/></div>
        </div>

        <div className="rounded-2xl p-4 text-xs leading-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.2)", color: "var(--mut)" }}>
          {mode === "purchase"
            ? "Sprzedajesz jako osoba prywatna. Oferta ma stałą cenę, bez negocjacji, i jest dostępna przez „Kup teraz”."
            : mode === "appointment"
              ? "Po utworzeniu usługi ustawisz długość wizyty, godziny dostępności i kalendarz. Termin zostanie zablokowany podczas płatności."
              : "Po utworzeniu wynajmu ustawisz dostępność, zasoby i kalendarz oraz opcjonalną kaucję dla auta lub sprzętu. Klient wybierze daty od–do, zobaczy czynsz za cały okres i od razu opłaci rezerwację."}
        </div>

        <button type="button" disabled={busy || uploading} onClick={publish} className="w-full rounded-2xl px-5 py-4 text-lg font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{busy ? "Tworzę ofertę…" : copy.publishLabel}</button>
      </section>
    </div>
  </main>;
}

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2" style={{background:"var(--header)",border:"1px solid var(--line)"}}><span className="text-sm">{label}</span><input type="checkbox" className="h-5 w-5" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
