import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { myOffers, uploadProductImage } from "../lib/api";
import { getOfferForManage, updateOfferManage, type ManagedOffer } from "../lib/sellerOfferManage";
import { supabase } from "../lib/supabase";
import OfferDescriptionEditor from "../components/OfferDescriptionEditor";
import OfferPhotoManager from "../components/OfferPhotoManager";

type OfferRow = {
  offer_id: string;
  title: string;
  price_gross: number;
  stock: number;
  status: string;
  category: string;
  created_at?: string;
};

type EditState = ManagedOffer & { full_vat_invoice: boolean; vat_rate: string };

const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };
const VAT_RATES = ["23", "8", "5", "0"] as const;

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
      const rawVat = String(attrs.vat_rate ?? "");
      setEdit({ ...o, full_vat_invoice: Boolean(attrs.full_vat_invoice), vat_rate: VAT_RATES.includes(rawVat as typeof VAT_RATES[number]) ? rawVat : "" });
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
    if (!VAT_RATES.includes(edit.vat_rate as typeof VAT_RATES[number])) { setMsg("Wybierz stawkę VAT: 23%, 8%, 5% lub 0%."); return; }
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
        attributes: { ...(edit.attributes ?? {}), full_vat_invoice: edit.full_vat_invoice, vat_rate: Number(edit.vat_rate) },
      });
      await reload();
      setMsg("Oferta zapisana ✅ Stawka VAT jest używana jako podstawa netto dla nowych zamówień i prowizji.");
    } catch (e) { setMsg("Nie udało się zapisać: " + (e as Error).message); }
    finally { setSaving(false); }
  }

  if (authed === null) return <Shell><p>Ładowanie…</p></Shell>;
  if (!authed) return <Shell><p>Zaloguj się, aby zarządzać ofertami. <Link to="/login" className="underline">Logowanie</Link></p></Shell>;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/sprzedawca" className="text-sm" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Moje oferty</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Edycja oferty, zdjęcia, VAT i model cashback/prowizji. Booking, grafiki i dostępność mają jedno centralne miejsce.</p>
      </div>
      <Link to="/sprzedawca/wystaw" className="rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Wystaw ofertę</Link>
    </div>

    {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{msg}</div>}

    {edit && <div className="mb-7 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><div className="text-xs" style={{ color: "var(--mut)" }}>{edit.category}</div><h2 className="text-xl font-semibold">Edytuj ofertę</h2></div>
          <button onClick={() => setEdit(null)} className="text-sm underline" style={{ color: "var(--mut)" }}>Zamknij</button>
        </div>
        <div className="space-y-4">
          <input className={inputClass} style={inputStyle} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}/>
          <OfferDescriptionEditor value={edit.description ?? ""} onChange={description=>setEdit({...edit,description})} title={edit.title} category={edit.category}/>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Cena brutto<input type="number" className={`${inputClass} mt-1`} style={inputStyle} value={edit.price_gross} onChange={e => setEdit({ ...edit, price_gross: Number(e.target.value) })}/></label>
            <label className="text-sm">Stawka VAT<select className={`${inputClass} mt-1`} style={inputStyle} value={edit.vat_rate} onChange={e => setEdit({ ...edit, vat_rate: e.target.value })}><option value="">Wybierz VAT</option>{VAT_RATES.map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
            <label className="text-sm">Stan / dostępność<input type="number" className={`${inputClass} mt-1`} style={inputStyle} value={edit.stock} onChange={e => setEdit({ ...edit, stock: Number(e.target.value) })}/></label>
          </div>
          {!edit.vat_rate && <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.20)", color: "#fca5a5" }}>Ta starsza oferta nie ma zapisanej stawki VAT. Wybierz właściwą stawkę przed zapisaniem — nie ustawiamy automatycznie 23%.</div>}
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
            <label className="flex items-center justify-between gap-4"><div><div className="font-medium">Prowizje Ambassador Club</div><div className="text-xs" style={{ color: "var(--mut)" }}>Wyłączone = tylko cashback. Włączone = cashback + prowizje polecające.</div></div><input type="checkbox" checked={edit.commission_model === "mlm_full"} onChange={e => setEdit({ ...edit, commission_model: e.target.checked ? "mlm_full" : "cashback_only" })}/></label>
          </div>
          <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
            <label className="flex items-center justify-between gap-4"><div><div className="font-medium">Pełna faktura VAT</div><div className="text-xs" style={{ color: "var(--mut)" }}>To informacja widoczna klientowi. Stawka VAT powyżej służy do prawidłowych rozliczeń netto.</div></div><input type="checkbox" checked={edit.full_vat_invoice} onChange={e => setEdit({ ...edit, full_vat_invoice: e.target.checked })}/></label>
          </div>
          <OfferPhotoManager images={edit.image_urls} onChange={image_urls=>setEdit({...edit,image_urls})} onAddFiles={uploadEditFiles} uploading={uploading} onBuyMore={()=>setMsg("Płatne pakiety dodatkowych zdjęć są przygotowane jako następny moduł płatności Sunrise Pay.")}/>
          <button disabled={saving} onClick={saveOffer} className="w-full rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{saving ? "Zapisuję…" : "Zapisz ofertę"}</button>
        </div>
      </Card>

      <Card>
        <div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>CENTRALNE USTAWIENIA</div>
        <h2 className="mt-1 text-xl font-semibold">📅 Rezerwacje i dostępność</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>Booking tej oferty konfigurujesz w jednym miejscu. Tam ustawisz typ rezerwacji, usługi, pracowników i inne zasoby, godziny pracy, nieobecności, ceny sezonowe, kaucję, minimalny/maksymalny okres oraz automatyczne potwierdzanie.</p>
        <div className="mt-5 space-y-3">
          <Link to={`/sprzedawca/rezerwacje/ustawienia/${edit.offer_id}`} className="block rounded-xl px-4 py-3 text-center font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Ustaw booking →</Link>
          <Link to="/sprzedawca/rezerwacje" className="block rounded-xl px-4 py-3 text-center text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Otwórz kalendarz rezerwacji</Link>
          <Link to="/sprzedawca/rezerwacje/grafiki" className="block rounded-xl px-4 py-3 text-center text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Grafiki pracowników i zasobów</Link>
        </div>
        <div className="mt-4 rounded-xl p-3 text-xs leading-5" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--mut)" }}>Dzięki temu oferta i kalendarz korzystają z jednej konfiguracji — bez ryzyka, że dwa różne formularze zapiszą sprzeczne ustawienia.</div>
      </Card>
    </div>}

    <Card>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input className={inputClass} style={inputStyle} placeholder="Szukaj po nazwie, kategorii lub ID…" value={query} onChange={e=>setQuery(e.target.value)}/>
        <select className={inputClass} style={inputStyle} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Wszystkie statusy</option><option value="active">Aktywne</option><option value="draft">Szkice</option><option value="blocked">Zablokowane</option><option value="archived">Archiwum</option></select>
        <div className="flex items-center text-sm" style={{ color: "var(--mut)" }}>{visible.length} z {rows.length}</div>
      </div>
      {loading ? <p>Ładowanie ofert…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left" style={{ color: "var(--mut)" }}><th className="pb-3">Oferta</th><th className="pb-3">Kategoria</th><th className="pb-3">Cena</th><th className="pb-3">Stan</th><th className="pb-3">Status</th><th className="pb-3"></th></tr></thead><tbody>{visible.map(r => <tr key={r.offer_id} style={{ borderTop: "1px solid var(--line)" }}><td className="py-3 pr-3"><div className="max-w-md font-medium">{r.title}</div><div className="mt-1 font-mono text-[10px]" style={{ color: "var(--mut)" }}>{r.offer_id}</div></td><td className="py-3 pr-3">{r.category}</td><td className="py-3 pr-3 whitespace-nowrap">{Number(r.price_gross).toLocaleString("pl-PL")} zł</td><td className="py-3 pr-3">{r.stock}</td><td className="py-3 pr-3">{r.status}</td><td className="py-3 text-right"><div className="flex justify-end gap-2"><Link to={`/produkt/${r.offer_id}`} className="rounded-lg px-3 py-1.5" style={{ border:"1px solid var(--line)" }}>Podgląd</Link><button onClick={()=>openEdit(r.offer_id)} className="rounded-lg px-3 py-1.5 font-semibold text-black" style={{ background:"linear-gradient(135deg,#C8965A,#E8C896)" }}>Edytuj</button></div></td></tr>)}</tbody></table>{visible.length===0 && <p className="py-6 text-center" style={{ color:"var(--mut)" }}>Brak ofert spełniających kryteria.</p>}</div>}
    </Card>
  </Shell>;
}

function Card({children}:{children:React.ReactNode}) { return <div className="rounded-2xl p-5" style={{ background:"var(--glass)", border:"1px solid var(--line)" }}>{children}</div>; }
function Shell({children}:{children:React.ReactNode}) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background:"var(--bg)", color:"var(--ink)" }}><div className="mx-auto max-w-7xl">{children}</div></main>; }
