import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { uploadProductImage } from "../lib/api";
import { getOfferForManage, updateOfferManage, type ManagedOffer } from "../lib/sellerOfferManage";
import OfferDescriptionEditor from "../components/OfferDescriptionEditor";
import OfferPhotoManager from "../components/OfferPhotoManager";

const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

type RentalKind = "car" | "equipment" | "property" | "other";
type RentalOperations = {
  pickup_location: string;
  pickup_time: string;
  return_time: string;
  handover_instructions: string;
  late_return_fee: number;
  important_terms: string;
  included_km_per_day: number;
  excess_km_fee: number;
  fuel_policy: string;
  min_driver_age: number;
  min_license_years: number;
  extra_driver_fee: number;
  insurance_excess: number;
  kit_contents: string;
  condition_return_policy: string;
};
type EditState = ManagedOffer & {
  full_vat_invoice: boolean;
  rental_kind: RentalKind;
  rental_operations: RentalOperations;
};

const emptyRentalOperations: RentalOperations = {
  pickup_location: "",
  pickup_time: "",
  return_time: "",
  handover_instructions: "",
  late_return_fee: 0,
  important_terms: "",
  included_km_per_day: 0,
  excess_km_fee: 0,
  fuel_policy: "",
  min_driver_age: 18,
  min_license_years: 0,
  extra_driver_fee: 0,
  insurance_excess: 0,
  kit_contents: "",
  condition_return_policy: "",
};

function rentalKindFromAttributes(attributes: Record<string, unknown>): RentalKind {
  const kind = String(attributes.rental_kind || "");
  if (kind === "car" || kind === "equipment" || kind === "property") return kind;
  const offerType = String(attributes.offer_type || "");
  if (offerType === "car_rental") return "car";
  if (offerType === "product_rental" || offerType === "equipment_rental") return "equipment";
  if (offerType === "property_rental") return "property";
  return "other";
}

function rentalOfferType(kind: RentalKind) {
  if (kind === "car") return "car_rental";
  if (kind === "equipment") return "equipment_rental";
  if (kind === "property") return "property_rental";
  return "rental";
}

function normalizeRentalOperations(value: unknown): RentalOperations {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: keyof RentalOperations, fallback = 0) => {
    const n = Number(raw[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    pickup_location: String(raw.pickup_location || ""),
    pickup_time: String(raw.pickup_time || ""),
    return_time: String(raw.return_time || ""),
    handover_instructions: String(raw.handover_instructions || ""),
    late_return_fee: number("late_return_fee"),
    important_terms: String(raw.important_terms || ""),
    included_km_per_day: number("included_km_per_day"),
    excess_km_fee: number("excess_km_fee"),
    fuel_policy: String(raw.fuel_policy || ""),
    min_driver_age: number("min_driver_age", 18),
    min_license_years: number("min_license_years"),
    extra_driver_fee: number("extra_driver_fee"),
    insurance_excess: number("insurance_excess"),
    kit_contents: String(raw.kit_contents || ""),
    condition_return_policy: String(raw.condition_return_policy || ""),
  };
}

export default function SellerOfferEdit() {
  const { offerId } = useParams();
  const [offer, setOffer] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!offerId) { setLoading(false); return; }
    getOfferForManage(offerId)
      .then((row) => {
        const attributes = (row.attributes ?? {}) as Record<string, unknown>;
        setOffer({
          ...row,
          full_vat_invoice: Boolean(attributes.full_vat_invoice),
          rental_kind: rentalKindFromAttributes(attributes),
          rental_operations: normalizeRentalOperations(attributes.rental_operations),
        });
      })
      .catch((error) => setMsg((error as Error).message))
      .finally(() => setLoading(false));
  }, [offerId]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !offer) return;
    const picked = Array.from(files).slice(0, Math.max(0, 12 - offer.image_urls.length));
    if (!picked.length) return;
    setUploading(true); setMsg(null);
    try {
      const urls: string[] = [];
      for (const file of picked) urls.push(await uploadProductImage(file));
      setOffer((current) => current ? { ...current, image_urls: [...current.image_urls, ...urls].slice(0, 12) } : current);
    } catch (error) {
      setMsg("Nie udało się dodać zdjęcia: " + (error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!offer) return;
    if (!offer.title.trim()) { setMsg("Podaj tytuł oferty."); return; }
    if (Number(offer.price_gross) <= 0) { setMsg("Cena musi być większa od 0."); return; }
    const isDaily = String(offer.attributes?.purchase_mode || "purchase") === "daily";
    setSaving(true); setMsg(null);
    try {
      await updateOfferManage({
        offerId: offer.offer_id,
        title: offer.title.trim(),
        description: offer.description ?? "",
        price: Number(offer.price_gross),
        stock: Number(offer.stock),
        imageUrls: offer.image_urls,
        commissionModel: offer.commission_model,
        attributes: {
          ...(offer.attributes ?? {}),
          full_vat_invoice: offer.full_vat_invoice,
          ...(isDaily ? {
            rental_kind: offer.rental_kind,
            offer_type: rentalOfferType(offer.rental_kind),
            rental_operations: offer.rental_operations,
          } : {}),
        },
      });
      setMsg(isDaily ? "Oferta, zdjęcia i warunki wynajmu zostały zapisane ✅" : "Oferta i zdjęcia zostały zapisane ✅");
    } catch (error) {
      setMsg("Nie udało się zapisać oferty: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Shell><p style={{ color: "var(--mut)" }}>Ładowanie oferty…</p></Shell>;
  if (!offer) return <Shell><Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link><p className="mt-4">{msg || "Nie znaleziono oferty."}</p></Shell>;

  const isDaily = String(offer.attributes?.purchase_mode || "purchase") === "daily";
  const isCar = isDaily && offer.rental_kind === "car";
  const isEquipment = isDaily && offer.rental_kind === "equipment";
  const isProperty = isDaily && offer.rental_kind === "property";
  const ops = offer.rental_operations;
  const setOps = (patch: Partial<RentalOperations>) => setOffer({ ...offer, rental_operations: { ...ops, ...patch } });

  return <Shell>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/sprzedawca" className="text-sm" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Edytuj ofertę</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{offer.category} · tutaj zmienisz treść, cenę i zdjęcia.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/produkt/${offer.offer_id}`} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Podgląd klienta</Link>
        <Link to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>📅 Booking / kalendarz</Link>
      </div>
    </div>

    {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(232,137,26,.12)", border: "1px solid rgba(232,137,26,.25)", color: "var(--gold)" }}>{msg}</div>}

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <h2 className="text-xl font-semibold">Treść oferty</h2>
        <div className="mt-4 space-y-4">
          <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Tytuł</span><input className={inputClass} style={inputStyle} value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Miejscowość</span><input className={inputClass} style={inputStyle} value={String(offer.attributes?.location ?? "")} onChange={(e) => setOffer({ ...offer, attributes: { ...(offer.attributes ?? {}), location: e.target.value } })} placeholder="np. Nowy Tomyśl, wielkopolskie" /></label>
          <OfferDescriptionEditor value={offer.description ?? ""} onChange={(description) => setOffer({ ...offer, description })} title={offer.title} category={offer.category} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isDaily ? "Cena za dobę" : "Cena brutto"}</span><input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={offer.price_gross} onChange={(e) => setOffer({ ...offer, price_gross: Number(e.target.value) })} /></label>
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isDaily ? "Liczba zasobów / sztuk" : "Stan / dostępność"}</span><input type="number" min="0" className={inputClass} style={inputStyle} value={offer.stock} onChange={(e) => setOffer({ ...offer, stock: Number(e.target.value) })} /></label>
          </div>
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}><label className="flex items-center justify-between gap-4"><div><div className="font-medium">Prowizje Ambassador Club</div><div className="text-xs" style={{ color: "var(--mut)" }}>Wyłączone = tylko cashback. Włączone = cashback + prowizje za polecenia.</div></div><input type="checkbox" checked={offer.commission_model === "mlm_full"} onChange={(e) => setOffer({ ...offer, commission_model: e.target.checked ? "mlm_full" : "cashback_only" })} /></label></div>
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}><label className="flex items-center justify-between gap-4"><div><div className="font-medium">Pełna faktura VAT</div><div className="text-xs" style={{ color: "var(--mut)" }}>Informacja zostanie pokazana klientowi przy ofercie.</div></div><input type="checkbox" checked={offer.full_vat_invoice} onChange={(e) => setOffer({ ...offer, full_vat_invoice: e.target.checked })} /></label></div>
        </div>
      </Card>

      <Card>
        <div className="mb-4"><h2 className="text-xl font-semibold">Zdjęcia oferty</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Dodaj do 12 zdjęć. Pierwsze zdjęcie jest główne.</p></div>
        <OfferPhotoManager images={offer.image_urls} onChange={(image_urls) => setOffer({ ...offer, image_urls })} onAddFiles={uploadFiles} uploading={uploading} onBuyMore={() => setMsg("W tej ofercie możesz dodać maksymalnie 12 zdjęć.")} />
      </Card>
    </div>

    {isDaily && <div className="mt-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>WYNAJEM</div><h2 className="mt-1 text-xl font-semibold">Odbiór, zwrot i zasady</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Te informacje klient zobaczy przed rezerwacją. Nie wpisuj tu prywatnego adresu, jeśli nie chcesz publikować go w ofercie.</p></div>
          <label className="min-w-[220px] text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Rodzaj wynajmu</span><select className={inputClass} style={inputStyle} value={offer.rental_kind} onChange={(e) => setOffer({ ...offer, rental_kind: e.target.value as RentalKind })}><option value="car">Auto</option><option value="equipment">Sprzęt / produkt</option><option value="property">Nieruchomość / nocleg</option><option value="other">Inny wynajem</option></select></label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="text-sm md:col-span-3"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isProperty ? "Miejsce zameldowania / odbioru kluczy" : "Miejsce odbioru"}</span><input className={inputClass} style={inputStyle} value={ops.pickup_location} onChange={(e) => setOps({ pickup_location: e.target.value })} placeholder={isProperty ? "np. Warszawa, Mokotów — szczegóły w instrukcji" : "np. Poznań, ul. Głogowska 10"} /></label>
          <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isProperty ? "Check-in od" : "Odbiór od"}</span><input type="time" className={inputClass} style={inputStyle} value={ops.pickup_time} onChange={(e) => setOps({ pickup_time: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isProperty ? "Check-out do" : "Zwrot do"}</span><input type="time" className={inputClass} style={inputStyle} value={ops.return_time} onChange={(e) => setOps({ return_time: e.target.value })} /></label>
          {!isProperty && <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Opłata za spóźniony zwrot / h</span><input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={ops.late_return_fee || ""} onChange={(e) => setOps({ late_return_fee: Number(e.target.value) })} /></label>}
          <label className="text-sm md:col-span-3"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{isProperty ? "Instrukcja zameldowania i wymeldowania" : "Instrukcja odbioru i zwrotu"}</span><textarea rows={3} className={inputClass} style={inputStyle} value={ops.handover_instructions} onChange={(e) => setOps({ handover_instructions: e.target.value })} placeholder="Dokumenty, kontakt, sposób przekazania, godziny, wymagania…" /></label>
          <label className="text-sm md:col-span-3"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Ważne warunki wynajmu</span><textarea rows={3} className={inputClass} style={inputStyle} value={ops.important_terms} onChange={(e) => setOps({ important_terms: e.target.value })} placeholder="Np. zakaz palenia, zasady anulowania, odpowiedzialność za szkody, zwierzęta…" /></label>
        </div>

        {isCar && <div className="mt-6 rounded-2xl p-4" style={{ background: "rgba(56,224,240,.06)", border: "1px solid rgba(56,224,240,.18)" }}>
          <h3 className="font-semibold">Warunki dla auta</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Km w cenie / dobę<input type="number" min="0" className={`${inputClass} mt-1`} style={inputStyle} value={ops.included_km_per_day || ""} onChange={(e) => setOps({ included_km_per_day: Number(e.target.value) })} /></label>
            <label className="text-sm">Dopłata za 1 km<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} style={inputStyle} value={ops.excess_km_fee || ""} onChange={(e) => setOps({ excess_km_fee: Number(e.target.value) })} /></label>
            <label className="text-sm">Minimalny wiek kierowcy<input type="number" min="18" className={`${inputClass} mt-1`} style={inputStyle} value={ops.min_driver_age || 18} onChange={(e) => setOps({ min_driver_age: Number(e.target.value) })} /></label>
            <label className="text-sm">Prawo jazdy od min. lat<input type="number" min="0" className={`${inputClass} mt-1`} style={inputStyle} value={ops.min_license_years || ""} onChange={(e) => setOps({ min_license_years: Number(e.target.value) })} /></label>
            <label className="text-sm sm:col-span-2">Paliwo / ładowanie<input className={`${inputClass} mt-1`} style={inputStyle} value={ops.fuel_policy} onChange={(e) => setOps({ fuel_policy: e.target.value })} placeholder="np. pełny–pełny / min. 80% baterii" /></label>
            <label className="text-sm">Dodatkowy kierowca<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} style={inputStyle} value={ops.extra_driver_fee || ""} onChange={(e) => setOps({ extra_driver_fee: Number(e.target.value) })} /><span className="mt-1 block text-xs" style={{ color: "var(--mut)" }}>zł / rezerwację</span></label>
            <label className="text-sm">Udział własny w szkodzie<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} style={inputStyle} value={ops.insurance_excess || ""} onChange={(e) => setOps({ insurance_excess: Number(e.target.value) })} /></label>
          </div>
        </div>}

        {isEquipment && <div className="mt-6 rounded-2xl p-4" style={{ background: "rgba(122,184,154,.07)", border: "1px solid rgba(122,184,154,.20)" }}>
          <h3 className="font-semibold">Warunki dla sprzętu</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Co wchodzi w zestaw</span><textarea rows={4} className={inputClass} style={inputStyle} value={ops.kit_contents} onChange={(e) => setOps({ kit_contents: e.target.value })} placeholder="Np. urządzenie, ładowarka, walizka, 2 akumulatory…" /></label>
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Stan i zasady zwrotu</span><textarea rows={4} className={inputClass} style={inputStyle} value={ops.condition_return_policy} onChange={(e) => setOps({ condition_return_policy: e.target.value })} placeholder="Np. zwrot kompletu, czysty sprzęt, kontrola uszkodzeń…" /></label>
          </div>
        </div>}

        <div className="mt-5 rounded-xl p-3 text-xs leading-5" style={{ background: "rgba(232,137,26,.08)", color: "var(--mut)" }}>Kaucję, długość wynajmu, dostępność zasobów i ceny sezonowe ustawiasz w <Link className="underline" to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`}>Booking / kalendarz</Link>. Kaucja pozostaje rozliczana oddzielnie od czynszu.</div>
      </Card>
    </div>}

    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
      <button disabled={saving || uploading} onClick={save} className="rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{saving ? "Zapisuję…" : isDaily ? "Zapisz ofertę i warunki wynajmu" : "Zapisz ofertę i zdjęcia"}</button>
      <Link to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`} className="rounded-xl px-5 py-3 text-center font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Dalej: booking →</Link>
    </div>
  </Shell>;
}

function Card({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</section>; }
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>; }
