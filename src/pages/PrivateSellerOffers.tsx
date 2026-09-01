import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { uploadProductImage } from "../lib/api";
import { getOfferForManage, updateOfferManage, type ManagedOffer } from "../lib/sellerOfferManage";
import { setMyOfferVisibility } from "../lib/sellerOfferActions";
import OfferPhotoManager from "../components/OfferPhotoManager";
import { zl } from "../lib/money";

type Row = {
  offer_id: string;
  title: string;
  price_gross: number;
  stock: number;
  status: string;
  display_status: string;
  category: string;
  image_url: string | null;
  created_at: string;
};

const STATUS: Record<string, { label: string; icon: string }> = {
  active: { label: "Aktywna", icon: "🟢" },
  reserved: { label: "Zarezerwowana", icon: "🟠" },
  sold: { label: "Sprzedana", icon: "✅" },
  sold_out: { label: "Sprzedana", icon: "✅" },
  paused: { label: "Ukryta", icon: "⚪" },
  blocked: { label: "Zablokowana", icon: "🔴" },
  archived: { label: "Archiwum", icon: "📁" },
};

export default function PrivateSellerOffers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ManagedOffer | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase.rpc("private_seller_offers_dashboard");
    if (error) setMsg(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  async function startEdit(id: string) {
    setMsg(null);
    try { setEdit(await getOfferForManage(id)); }
    catch (e) { setMsg((e as Error).message); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !edit) return;
    setUploading(true);
    try {
      const add: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 12 - edit.image_urls.length))) add.push(await uploadProductImage(file));
      setEdit({ ...edit, image_urls: [...edit.image_urls, ...add].slice(0, 12) });
    } catch (e) { setMsg((e as Error).message); }
    finally { setUploading(false); }
  }

  async function saveQuickEdit() {
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
        attributes: edit.attributes,
      });
      setEdit(null);
      await reload();
      setMsg("Ogłoszenie zapisane. ✅");
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggle(row: Row) {
    if (!['active','paused'].includes(row.status)) return;
    setBusyId(row.offer_id); setMsg(null);
    try { await setMyOfferVisibility(row.offer_id, row.status === 'paused'); await reload(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusyId(null); }
  }

  async function relist(row: Row) {
    setBusyId(row.offer_id); setMsg(null);
    try {
      const { data, error } = await supabase.rpc("relist_private_offer", { p_offer: row.offer_id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Nie udało się wystawić ponownie.");
      await reload();
      setMsg("Oferta znów jest aktywna — 1 sztuka dostępna. ✅");
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusyId(null); }
  }

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/sprzedawca" className="text-sm" style={{ color: "var(--mut)" }}>← Panel Partnera Handlowego</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Moje ogłoszenia</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Sprzedaż, usługi i wynajem w jednym miejscu. Zwykłe ogłoszenia pozostają proste i bez negocjacji ceny.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sprzedawca/rezerwacje" className="rounded-xl px-4 py-2 font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>📅 Rezerwacje i kalendarz</Link>
          <Link to="/sprzedawca/wystaw" className="rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Dodaj ofertę</Link>
        </div>
      </div>

      {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{msg}</div>}

      {edit && <section className="mb-6 rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-xs" style={{ color: "var(--mut)" }}>Szybka edycja</div><h2 className="text-xl font-semibold">{edit.title}</h2></div><button onClick={() => setEdit(null)} className="text-sm underline" style={{ color: "var(--mut)" }}>Zamknij</button></div>
        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <label className="text-sm">Cena brutto<input type="number" min="0.01" step="0.01" value={edit.price_gross} onChange={e => setEdit({ ...edit, price_gross: Number(e.target.value) })} className="mt-1 w-full rounded-xl px-3 py-2.5 outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)" }}/></label>
          <OfferPhotoManager images={edit.image_urls} onChange={image_urls => setEdit({ ...edit, image_urls })} onAddFiles={upload} uploading={uploading} />
        </div>
        <button disabled={saving} onClick={saveQuickEdit} className="mt-4 rounded-xl px-5 py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{saving ? "Zapisuję…" : "Zapisz cenę i zdjęcia"}</button>
      </section>}

      {loading ? <p>Ładowanie ogłoszeń…</p> : rows.length === 0 ? <div className="rounded-2xl p-8 text-center" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-4xl mb-3">📦</div><h2 className="text-xl font-semibold">Nie masz jeszcze ofert</h2><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Możesz sprzedać produkt, dodać usługę na termin albo wynajem z kalendarzem.</p><Link to="/sprzedawca/wystaw" className="mt-4 inline-block rounded-xl px-5 py-2.5 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Dodaj pierwszą ofertę</Link></div> : <div className="grid gap-4 md:grid-cols-2">
        {rows.map(row => {
          const st = STATUS[row.display_status] ?? { label: row.display_status, icon: "•" };
          const canRelist = ['sold','sold_out'].includes(row.display_status);
          return <article key={row.offer_id} className="rounded-2xl overflow-hidden" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="flex gap-4 p-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--header)" }}>{row.image_url ? <img src={row.image_url} alt="" className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-3xl">📷</div>}</div>
              <div className="min-w-0 flex-1"><div className="text-xs" style={{ color: "var(--mut)" }}>{row.category}</div><h2 className="mt-1 font-semibold leading-snug">{row.title}</h2><div className="mt-2 font-display text-xl font-semibold">{zl(row.price_gross)}</div><div className="mt-2 text-sm"><span>{st.icon} {st.label}</span>{row.display_status === 'active' && <span style={{ color: "var(--mut)" }}> · {row.stock} szt.</span>}</div></div>
            </div>
            <div className="flex flex-wrap gap-2 border-t p-3" style={{ borderColor: "var(--line)" }}>
              <Link to={`/produkt/${row.offer_id}`} className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Podgląd</Link>
              <button onClick={() => startEdit(row.offer_id)} className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>✏️ Cena i zdjęcia</button>
              {(row.status === 'active' || row.status === 'paused') && <button disabled={busyId===row.offer_id} onClick={() => toggle(row)} className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>{row.status === 'active' ? 'Ukryj' : 'Pokaż'}</button>}
              {canRelist && <button disabled={busyId===row.offer_id} onClick={() => relist(row)} className="rounded-lg px-3 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>↻ Wystaw ponownie</button>}
            </div>
          </article>;
        })}
      </div>}
    </main>
  </div>;
}