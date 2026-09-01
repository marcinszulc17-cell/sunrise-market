import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { childCategories, configureBookingOffer, topCategories, uploadProductImage } from "../lib/api";

type Cat = { id: string; slug: string; name: string };
type BookingMode = "appointment" | "daily";

const field = "w-full rounded-2xl px-4 py-3 outline-none";
const fieldStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

export default function PrivateBookingOfferWizard() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const mode: BookingMode = sp.get("mode") === "daily" ? "daily" : "appointment";
  const isDaily = mode === "daily";
  const draftKey = `sunrise_market_private_booking_${mode}_v1`;

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState(60);
  const [units, setUnits] = useState(1);
  const [d1, setD1] = useState<Cat[]>([]);
  const [d2, setD2] = useState<Cat[]>([]);
  const [d3, setD3] = useState<Cat[]>([]);
  const [s1, setS1] = useState<Cat | null>(null);
  const [s2, setS2] = useState<Cat | null>(null);
  const [s3, setS3] = useState<Cat | null>(null);
  const chosen = s3 ?? s2 ?? s1;

  useEffect(() => {
    topCategories().then(x => setD1(x as Cat[])).catch(() => setD1([]));
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (d) {
        setTitle(d.title || "");
        setDescription(d.description || "");
        setPrice(d.price || "");
        setDuration(Number(d.duration || 60));
        setUnits(Math.max(1, Number(d.units || 1)));
        setImages(Array.isArray(d.images) ? d.images : []);
      }
    } catch { /* ignore */ }
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify({ title, description, price, duration, units, images })), 250);
    return () => clearTimeout(t);
  }, [draftKey, title, description, price, duration, units, images]);

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
    } catch (e) {
      setMsg("Nie udało się dodać zdjęcia: " + (e as Error).message);
    } finally { setUploading(false); }
  }

  async function publish() {
    if (!images.length) { setMsg("Dodaj przynajmniej jedno zdjęcie."); return; }
    if (!title.trim()) { setMsg(isDaily ? "Wpisz nazwę wynajmowanego produktu lub obiektu." : "Wpisz nazwę usługi."); return; }
    if (!chosen) { setMsg("Wybierz kategorię."); return; }
    if (!(Number(price) > 0)) { setMsg("Podaj cenę większą od 0 zł."); return; }
    if (!isDaily && duration < 15) { setMsg("Czas trwania usługi musi mieć co najmniej 15 minut."); return; }

    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc("create_offer_v2", {
        p_title: title.trim(),
        p_description: description.trim(),
        p_price: Number(price),
        p_stock: isDaily ? Math.max(1, units) : 1,
        p_category_slug: chosen.slug,
        p_image_urls: images,
        p_commission_model: "cashback_only",
        p_attributes: {
          seller_nature: "private",
          private_listing: true,
          negotiable: false,
          purchase_mode: mode,
          offer_type: isDaily ? "rental" : "service",
          booking_enabled: true,
        },
      });
      if (error) throw error;
      const offerId = String(data || "");
      if (!offerId) throw new Error("Oferta powstała, ale nie otrzymano jej ID.");

      await configureBookingOffer({
        offerId,
        bookingType: mode,
        durationMinutes: isDaily ? null : duration,
        slotIntervalMinutes: isDaily ? 1440 : 30,
        minNoticeHours: 2,
        maxAdvanceDays: 365,
        maxUnits: isDaily ? Math.max(1, units) : 1,
        pricePerUnit: Number(price),
        active: false,
      });

      localStorage.removeItem(draftKey);
      navigate(`/sprzedawca/rezerwacje/ustawienia/${offerId}?new=1`, { replace: true });
    } catch (e) {
      setMsg("Nie udało się utworzyć oferty: " + (e as Error).message);
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>PARTNER HANDLOWY · BOOKING</div>
          <h1 className="mt-1 text-3xl font-semibold">{isDaily ? "Wystaw na wynajem" : "Wystaw usługę"}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{isDaily ? "Klient wybierze okres od–do, a następnie zapłaci." : "Klient wybierze dostępny dzień i godzinę, a następnie zapłaci."}</p>
        </div>
        <Link to="/sprzedawca/wystaw" className="text-sm underline" style={{ color: "var(--mut)" }}>Anuluj</Link>
      </div>

      {msg && <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.24)", color: "var(--gold)" }}>{msg}</div>}

      <section className="space-y-6 rounded-3xl p-5 sm:p-7" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">1. Zdjęcia</h2><span className="text-xs" style={{ color: "var(--mut)" }}>{images.length}/12</span></div>
          <label className="flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border border-dashed text-center text-sm font-semibold" style={{ borderColor: "var(--line)", background: "var(--header)" }}>
            <div><div className="text-3xl">📷</div><div className="mt-2">{uploading ? "Dodaję zdjęcia…" : images.length ? "+ Dodaj kolejne" : "Dodaj zdjęcia"}</div></div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
          </label>
          {images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, i) => <div key={`${url}-${i}`} className="relative"><img src={url} alt="" className="aspect-square w-full rounded-xl object-cover"/><button type="button" onClick={() => setImages(p => p.filter((_,j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">×</button></div>)}</div>}
        </div>

        <div><h2 className="mb-3 text-lg font-semibold">2. {isDaily ? "Co wynajmujesz?" : "Jaką usługę oferujesz?"}</h2><input className={field} style={fieldStyle} placeholder={isDaily ? "Np. Toyota Corolla / apartament / wiertnica" : "Np. Masaż 60 min / strzyżenie / konsultacja"} value={title} onChange={e=>setTitle(e.target.value)} /></div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">3. Kategoria</h2>
          <div className="grid gap-2 sm:grid-cols-3"><select className={field} style={fieldStyle} value={s1?.slug || ""} onChange={e=>pick1(e.target.value)}><option value="">Dział</option>{d1.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>{d2.length>0 && <select className={field} style={fieldStyle} value={s2?.slug || ""} onChange={e=>pick2(e.target.value)}><option value="">Kategoria</option>{d2.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}{d3.length>0 && <select className={field} style={fieldStyle} value={s3?.slug || ""} onChange={e=>pick3(e.target.value)}><option value="">Podkategoria</option>{d3.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-semibold">{isDaily ? "Cena za dobę" : "Cena usługi"}</span><div className="relative"><input inputMode="decimal" type="number" min="0" step="0.01" className={field} style={{...fieldStyle,paddingRight:52}} value={price} onChange={e=>setPrice(e.target.value)} /><span className="absolute right-4 top-3.5 text-sm" style={{color:"var(--mut)"}}>zł</span></div></label>
          {isDaily ? <label><span className="mb-2 block text-sm font-semibold">Liczba dostępnych sztuk / jednostek</span><input type="number" min="1" max="100" className={field} style={fieldStyle} value={units} onChange={e=>setUnits(Math.max(1, Number(e.target.value || 1)))} /></label> : <label><span className="mb-2 block text-sm font-semibold">Czas trwania</span><select className={field} style={fieldStyle} value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option><option value={180}>180 min</option><option value={240}>240 min</option></select></label>}
        </div>

        <label><span className="mb-2 block text-sm font-semibold">Opis <span className="font-normal" style={{color:"var(--mut)"}}>(opcjonalnie)</span></span><textarea rows={5} className={field} style={fieldStyle} placeholder="Opisz ofertę, warunki i najważniejsze informacje…" value={description} onChange={e=>setDescription(e.target.value)} /></label>

        <div className="rounded-2xl p-4 text-sm leading-6" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.2)", color: "var(--mut)" }}>
          Po utworzeniu oferty przejdziesz do kalendarza. Tam ustawisz dni i godziny dostępności, przerwy oraz zasoby. Oferta pozostanie niewidoczna do czasu zakończenia konfiguracji bookingu.
        </div>

        <button type="button" disabled={busy || uploading} onClick={publish} className="w-full rounded-2xl px-5 py-4 text-lg font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Tworzę…" : isDaily ? "Dalej — ustaw kalendarz wynajmu" : "Dalej — ustaw kalendarz usługi"}</button>
      </section>
    </div>
  </main>;
}
