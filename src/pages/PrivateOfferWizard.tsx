import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { childCategories, topCategories, uploadProductImage } from "../lib/api";

type Cat = { id: string; slug: string; name: string };
type Delivery = "shipping" | "pickup" | "both";
type Condition = "new" | "very_good" | "good" | "used" | "damaged";

const field = "w-full rounded-2xl px-4 py-3 outline-none";
const fieldStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };
const DRAFT_KEY = "sunrise_market_private_offer_draft_v1";

export default function PrivateOfferWizard() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState("");
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

  useEffect(() => {
    topCategories().then(x => setD1(x as Cat[])).catch(() => setD1([]));
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d) {
        setTitle(d.title || ""); setDescription(d.description || ""); setPrice(d.price || "");
        setCondition(d.condition || "good"); setDelivery(d.delivery || "both");
        setReferrals(d.referrals !== false);
        setImages(Array.isArray(d.images) ? d.images : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, price, condition, delivery, referrals, images })), 250);
    return () => clearTimeout(t);
  }, [title, description, price, condition, delivery, referrals, images]);

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
    if (!title.trim()) { setMsg("Wpisz nazwę przedmiotu."); return; }
    if (!chosen) { setMsg("Wybierz kategorię."); return; }
    if (!(Number(price) > 0)) { setMsg("Podaj cenę większą od 0 zł."); return; }
    setBusy(true); setMsg(null);
    try {
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
          condition,
          delivery,
          negotiable: false,
          purchase_mode: "purchase",
          offer_type: "product",
          private_listing: true,
          buy_now_only: true,
        },
      });
      if (error) throw error;
      const id = String(data || "");
      localStorage.removeItem(DRAFT_KEY);
      if (id) navigate(`/sprzedawca/oferty/${id}/edytuj?new=1`, { replace: true });
      else navigate("/sprzedawca/oferty", { replace: true });
    } catch (e) { setMsg("Nie udało się opublikować: " + (e as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>PARTNER HANDLOWY</div><h1 className="mt-1 text-3xl font-semibold">Wystaw przedmiot</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Stała cena i jeden prosty zakup: Kup teraz.</p></div>
        <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>Anuluj</Link>
      </div>

      {msg && <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.24)", color: "var(--gold)" }}>{msg}</div>}

      <section className="space-y-6 rounded-3xl p-5 sm:p-7" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">1. Zdjęcia</h2><span className="text-xs" style={{ color: "var(--mut)" }}>{images.length}/12</span></div>
          <label className="flex min-h-32 cursor-pointer items-center justify-center rounded-2xl border border-dashed text-center text-sm font-semibold" style={{ borderColor: "var(--line)", background: "var(--header)" }}>
            <div><div className="text-3xl">📷</div><div className="mt-2">{uploading ? "Dodaję zdjęcia…" : images.length ? "+ Dodaj kolejne" : "Dodaj zdjęcia"}</div><div className="mt-1 text-xs font-normal" style={{ color: "var(--mut)" }}>Pierwsze będzie zdjęciem głównym</div></div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
          </label>
          {images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, i) => <div key={`${url}-${i}`} className="relative"><img src={url} alt="" className="aspect-square w-full rounded-xl object-cover"/><button type="button" onClick={() => setImages(p => p.filter((_,j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">×</button>{i===0 && <span className="absolute bottom-1 left-1 rounded-lg bg-black/70 px-2 py-1 text-[10px] text-white">Główne</span>}</div>)}</div>}
        </div>

        <div><h2 className="mb-3 text-lg font-semibold">2. Co sprzedajesz?</h2><input className={field} style={fieldStyle} placeholder="Np. iPhone 15 Pro 256 GB" value={title} onChange={e=>setTitle(e.target.value)} /></div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">3. Kategoria</h2>
          <div className="grid gap-2 sm:grid-cols-3"><select className={field} style={fieldStyle} value={s1?.slug || ""} onChange={e=>pick1(e.target.value)}><option value="">Dział</option>{d1.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>{d2.length>0 && <select className={field} style={fieldStyle} value={s2?.slug || ""} onChange={e=>pick2(e.target.value)}><option value="">Kategoria</option>{d2.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}{d3.length>0 && <select className={field} style={fieldStyle} value={s3?.slug || ""} onChange={e=>pick3(e.target.value)}><option value="">Podkategoria</option>{d3.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-semibold">Stan</span><select className={field} style={fieldStyle} value={condition} onChange={e=>setCondition(e.target.value as Condition)}><option value="new">Nowy</option><option value="very_good">Bardzo dobry</option><option value="good">Dobry</option><option value="used">Używany</option><option value="damaged">Uszkodzony / do naprawy</option></select></label>
          <label><span className="mb-2 block text-sm font-semibold">Cena</span><div className="relative"><input inputMode="decimal" type="number" min="0" step="0.01" className={field} style={{...fieldStyle,paddingRight:52}} placeholder="0" value={price} onChange={e=>setPrice(e.target.value)} /><span className="absolute right-4 top-3.5 text-sm" style={{color:"var(--mut)"}}>zł</span></div></label>
        </div>

        <label><span className="mb-2 block text-sm font-semibold">Opis <span className="font-normal" style={{color:"var(--mut)"}}>(opcjonalnie)</span></span><textarea rows={5} className={field} style={fieldStyle} placeholder="Napisz krótko, w jakim jest stanie i co warto wiedzieć…" value={description} onChange={e=>setDescription(e.target.value)} /></label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-semibold">Dostawa</span><select className={field} style={fieldStyle} value={delivery} onChange={e=>setDelivery(e.target.value as Delivery)}><option value="both">Wysyłka lub odbiór</option><option value="shipping">Tylko wysyłka</option><option value="pickup">Tylko odbiór osobisty</option></select></label>
          <div className="pt-1 sm:pt-7"><Toggle label="Pozwól zarabiać na poleceniu" checked={referrals} onChange={setReferrals}/></div>
        </div>

        <div className="rounded-2xl p-4 text-xs leading-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.2)", color: "var(--mut)" }}>
          Sprzedajesz jako osoba prywatna. Oferta ma stałą cenę i jest dostępna wyłącznie przez „Kup teraz”. Klient zobaczy typ sprzedawcy przy ofercie.
        </div>

        <button type="button" disabled={busy || uploading} onClick={publish} className="w-full rounded-2xl px-5 py-4 text-lg font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Publikuję…" : "Opublikuj ofertę"}</button>
      </section>
    </div>
  </main>;
}

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2" style={{background:"var(--header)",border:"1px solid var(--line)"}}><span className="text-sm">{label}</span><input type="checkbox" className="h-5 w-5" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
