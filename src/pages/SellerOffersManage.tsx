import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  bookingPublicConfig,
  configureBookingOffer,
  myOffers,
  replaceBookingAvailability,
  uploadProductImage,
  type BookingType,
  type BookingWindow,
} from "../lib/api";
import { getOfferForManage, updateOfferManage, type ManagedOffer } from "../lib/sellerOfferManage";
import { supabase } from "../lib/supabase";

type OfferRow = {
  offer_id: string;
  title: string;
  price_gross: number;
  stock: number;
  status: string;
  category: string;
  created_at?: string;
};

type EditState = ManagedOffer & { full_vat_invoice: boolean };

const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };
const weekdays = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

export default function SellerOffersManage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [bookingType, setBookingType] = useState<BookingType>("appointment");
  const [bookingActive, setBookingActive] = useState(false);
  const [duration, setDuration] = useState(60);
  const [pricePerUnit, setPricePerUnit] = useState(0);
  const [windows, setWindows] = useState<BookingWindow[]>([]);
  const [bookingSaving, setBookingSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try { setRows((await myOffers()) as OfferRow[]); }
    catch (e) { setMsg((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); setLoading(false); return; }
      setAuthed(true);
      await reload();
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return `${r.title} ${r.category} ${r.offer_id}`.toLowerCase().includes(q);
    }).slice(0, 100);
  }, [rows, query, status]);

  async function openEdit(id: string) {
    setMsg(null);
    try {
      const o = await getOfferForManage(id);
      const attrs = (o.attributes ?? {}) as Record<string, unknown>;
      setEdit({ ...o, full_vat_invoice: Boolean(attrs.full_vat_invoice) });
      setBookingType("appointment");
      setBookingActive(false);
      setDuration(60);
      setPricePerUnit(Number(o.price_gross));
      setWindows([]);
      try {
        const cfg = await bookingPublicConfig(id);
        if (cfg) {
          setBookingType(cfg.booking_type);
          setBookingActive(true);
          setDuration(Number(cfg.duration_minutes ?? 60));
          setPricePerUnit(Number(cfg.price_per_unit ?? o.price_gross));
          setWindows(cfg.weekly_availability ?? []);
        }
      } catch { /* booking opcjonalny */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setMsg("Nie udało się otworzyć oferty: " + (e as Error).message); }
  }

  async function uploadEditFiles(files: FileList | null) {
    if (!files?.length || !edit) return;
    const picked = Array.from(files).slice(0, Math.max(0, 12 - edit.image_urls.length));
    setUploading(true); setMsg(null);
    try {
      const urls: string[] = [];
      for (const file of picked) urls.push(await uploadProductImage(file));
      setEdit((e) => e ? { ...e, image_urls: [...e.image_urls, ...urls].slice(0, 12) } : e);
    } catch (e) { setMsg("Błąd zdjęcia: " + (e as Error).message); }
    finally { setUploading(false); }
  }

  async function saveOffer() {
    if (!edit) return;
    setSaving(true); setMsg(null);
    try {
      await updateOfferManage({
        offerId: edit.offer_id,
        title: edit.title,
        description: edit.description ?? "",
        price: Number(edit.price_gross),
        stock: Number(edit.stock),
        imageUrls: edit.image_urls,
        commissionModel: edit.commission_model,
        attributes: { ...(edit.attributes ?? {}), full_vat_invoice: edit.full_vat_invoice },
      });
      await reload();
      setMsg("Oferta zapisana ✅");
    } catch (e) { setMsg("Nie udało się zapisać: " + (e as Error).message); }
    finally { setSaving(false); }
  }

  function addWindow(day: number) {
    if (windows.some(w => w.weekday === day)) return;
    setWindows(prev => [...prev, { weekday: day, starts_at: "08:00", ends_at: "18:00" }].sort((a,b) => a.weekday-b.weekday));
  }

  async function saveBooking() {
    if (!edit) return;
    setBookingSaving(true); setMsg(null);
    try {
      await configureBookingOffer({
        offerId: edit.offer_id,
        bookingType,
        durationMinutes: bookingType === "appointment" ? duration : null,
        slotIntervalMinutes: 30,
        minNoticeHours: 2,
        maxAdvanceDays: 180,
        maxUnits: bookingType === "daily" ? 60 : 1,
        pricePerUnit: Number(pricePerUnit || edit.price_gross),
        active: bookingActive,
      });
      if (bookingActive) await replaceBookingAvailability(edit.offer_id, windows);
      setMsg(bookingActive ? "Booking zapisany i aktywny ✅" : "Booking wyłączony ✅");
    } catch (e) { setMsg("Nie udało się zapisać bookingu: " + (e as Error).message); }
    finally { setBookingSaving(false); }
  }

  if (authed === null) return <Shell><p>Ładowanie…</p></Shell>;
  if (!authed) return <Shell><p>Zaloguj się, aby zarządzać ofertami. <Link to="/login" className="underline">Logowanie</Link></p></Shell>;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><Link to="/sprzedawca" className="text-sm" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link><h1 className="mt-2 font-display text-3xl font-semibold">Moje oferty</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Edycja, zdjęcia, cashback/prowizje i booking w jednym miejscu.</p></div>
      <Link to="/sprzedawca/wystaw" className="rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Wystaw ofertę</Link>
    </div>

    {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{msg}</div>}

    {edit && <div className="mb-7 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-xs" style={{ color: "var(--mut)" }}>{edit.category}</div><h2 className="text-xl font-semibold">Edytuj ofertę</h2></div><button onClick={() => setEdit(null)} className="text-sm underline" style={{ color: "var(--mut)" }}>Zamknij</button></div>
        <div className="space-y-4">
          <input className={inputClass} style={inputStyle} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}/>
          <textarea className={inputClass} style={inputStyle} rows={7} value={edit.description ?? ""} onChange={e => setEdit({ ...edit, description: e.target.value })}/>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Cena brutto<input type="number" className={`${inputClass} mt-1`} style={inputStyle} value={edit.price_gross} onChange={e => setEdit({ ...edit, price_gross: Number(e.target.value) })}/></label><label className="text-sm">Stan / dostępność<input type="number" className={`${inputClass} mt-1`} style={inputStyle} value={edit.stock} onChange={e => setEdit({ ...edit, stock: Number(e.target.value) })}/></label></div>
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}><label className="flex items-center justify-between gap-4"><div><div className="font-medium">Prowizje Ambassador Club</div><div className="text-xs" style={{ color: "var(--mut)" }}>Wyłączone = tylko cashback. Włączone = cashback + prowizje polecające.</div></div><input type="checkbox" checked={edit.commission_model === "mlm_full"} onChange={e => setEdit({ ...edit, commission_model: e.target.checked ? "mlm_full" : "cashback_only" })}/></label></div>
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}><label className="flex items-center justify-between gap-4"><div className="font-medium">Pełna faktura VAT</div><input type="checkbox" checked={edit.full_vat_invoice} onChange={e => setEdit({ ...edit, full_vat_invoice: e.target.checked })}/></label></div>
          <div><div className="mb-2 flex justify-between text-sm"><b>Zdjęcia ({edit.image_urls.length}/12)</b><span style={{ color: "var(--mut)" }}>Pierwsze = główne</span></div><label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--line)" }}>{uploading ? "Wysyłanie…" : "+ Dodaj zdjęcia"}<input className="hidden" type="file" multiple accept="image/*" onChange={e => uploadEditFiles(e.target.files)}/></label><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{edit.image_urls.map((url,i) => <div key={`${url}-${i}`} className="relative"><img src={url} className="aspect-square w-full rounded-lg object-cover" alt=""/><button onClick={() => setEdit({ ...edit, image_urls: edit.image_urls.filter((_,j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-xs text-white">×</button>{i===0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">Główne</span>}</div>)}</div></div>
          <button disabled={saving} onClick={saveOffer} className="w-full rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{saving ? "Zapisuję…" : "Zapisz ofertę"}</button>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">📅 Booking</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Ta sama funkcja obsługuje usługę, wynajem auta i nieruchomości.</p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between"><span className="font-medium">Aktywny booking</span><input type="checkbox" checked={bookingActive} onChange={e => setBookingActive(e.target.checked)}/></label>
          <label className="text-sm">Typ rezerwacji<select className={`${inputClass} mt-1`} style={inputStyle} value={bookingType} onChange={e => setBookingType(e.target.value as BookingType)}><option value="appointment">Termin / usługa</option><option value="daily">Wynajem na dni</option></select></label>
          {bookingType === "appointment" && <label className="text-sm">Długość usługi (min)<input type="number" min="15" className={`${inputClass} mt-1`} style={inputStyle} value={duration} onChange={e => setDuration(Number(e.target.value))}/></label>}
          <label className="text-sm">{bookingType === "daily" ? "Cena za dzień" : "Cena za termin"}<input type="number" min="0" className={`${inputClass} mt-1`} style={inputStyle} value={pricePerUnit} onChange={e => setPricePerUnit(Number(e.target.value))}/></label>
          <div><div className="mb-2 text-sm font-medium">Dostępność tygodniowa</div><div className="flex flex-wrap gap-2">{weekdays.map((d,i) => <button key={d} type="button" onClick={() => addWindow(i)} className="rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--line)" }}>+ {d}</button>)}</div><div className="mt-3 space-y-2">{windows.map((w,i) => <div key={`${w.weekday}-${i}`} className="grid grid-cols-[40px_1fr_1fr_32px] items-center gap-2 text-xs"><b>{weekdays[w.weekday]}</b><input type="time" className={inputClass} style={inputStyle} value={w.starts_at} onChange={e => setWindows(prev => prev.map((x,j)=>j===i?{...x,starts_at:e.target.value}:x))}/><input type="time" className={inputClass} style={inputStyle} value={w.ends_at} onChange={e => setWindows(prev => prev.map((x,j)=>j===i?{...x,ends_at:e.target.value}:x))}/><button onClick={() => setWindows(prev => prev.filter((_,j)=>j!==i))}>×</button></div>)}</div></div>
          <button disabled={bookingSaving} onClick={saveBooking} className="w-full rounded-xl py-3 font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>{bookingSaving ? "Zapisuję…" : "Zapisz booking"}</button>
          <Link to="/rezerwacje" className="block text-center text-sm underline" style={{ color: "var(--mut)" }}>Podgląd rezerwacji klienta</Link>
        </div>
      </Card>
    </div>}

    <Card>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><input className={inputClass} style={inputStyle} placeholder="Szukaj po nazwie, kategorii lub ID…" value={query} onChange={e=>setQuery(e.target.value)}/><select className={inputClass} style={inputStyle} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Wszystkie statusy</option><option value="active">Aktywne</option><option value="draft">Szkice</option><option value="blocked">Zablokowane</option></select><div className="flex items-center text-sm" style={{ color: "var(--mut)" }}>{visible.length} z {rows.length}</div></div>
      {loading ? <p>Ładowanie ofert…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left" style={{ color: "var(--mut)" }}><th className="pb-3">Oferta</th><th className="pb-3">Kategoria</th><th className="pb-3">Cena</th><th className="pb-3">Stan</th><th className="pb-3">Status</th><th className="pb-3"></th></tr></thead><tbody>{visible.map(r => <tr key={r.offer_id} style={{ borderTop: "1px solid var(--line)" }}><td className="py-3 pr-3"><div className="max-w-md font-medium">{r.title}</div><div className="mt-1 font-mono text-[10px]" style={{ color: "var(--mut)" }}>{r.offer_id}</div></td><td className="py-3 pr-3">{r.category}</td><td className="py-3 pr-3 whitespace-nowrap">{Number(r.price_gross).toLocaleString("pl-PL")} zł</td><td className="py-3 pr-3">{r.stock}</td><td className="py-3 pr-3">{r.status}</td><td className="py-3 text-right"><div className="flex justify-end gap-2"><Link to={`/produkt/${r.offer_id}`} className="rounded-lg px-3 py-1.5" style={{ border:"1px solid var(--line)" }}>Podgląd</Link><button onClick={()=>openEdit(r.offer_id)} className="rounded-lg px-3 py-1.5 font-semibold text-black" style={{ background:"linear-gradient(135deg,#C8965A,#E8C896)" }}>Edytuj</button></div></td></tr>)}</tbody></table>{visible.length===0 && <p className="py-6 text-center" style={{ color:"var(--mut)" }}>Brak ofert spełniających kryteria.</p>}</div>}
    </Card>
  </Shell>;
}

function Card({children}:{children:React.ReactNode}) { return <div className="rounded-2xl p-5" style={{ background:"var(--glass)", border:"1px solid var(--line)" }}>{children}</div>; }
function Shell({children}:{children:React.ReactNode}) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background:"var(--bg)", color:"var(--ink)" }}><div className="mx-auto max-w-7xl">{children}</div></main>; }
