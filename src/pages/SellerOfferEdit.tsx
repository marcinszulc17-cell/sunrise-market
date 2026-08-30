import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { uploadProductImage } from "../lib/api";
import { getOfferForManage, updateOfferManage, type ManagedOffer } from "../lib/sellerOfferManage";
import OfferDescriptionEditor from "../components/OfferDescriptionEditor";
import OfferPhotoManager from "../components/OfferPhotoManager";

const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

type EditState = ManagedOffer & { full_vat_invoice: boolean };

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
        setOffer({ ...row, full_vat_invoice: Boolean(attributes.full_vat_invoice) });
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
        attributes: { ...(offer.attributes ?? {}), full_vat_invoice: offer.full_vat_invoice },
      });
      setMsg("Oferta i zdjęcia zostały zapisane ✅");
    } catch (error) {
      setMsg("Nie udało się zapisać oferty: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Shell><p style={{ color: "var(--mut)" }}>Ładowanie oferty…</p></Shell>;
  if (!offer) return <Shell><Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link><p className="mt-4">{msg || "Nie znaleziono oferty."}</p></Shell>;

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

    {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{msg}</div>}

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <h2 className="text-xl font-semibold">Treść oferty</h2>
        <div className="mt-4 space-y-4">
          <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Tytuł</span><input className={inputClass} style={inputStyle} value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label>
          <OfferDescriptionEditor value={offer.description ?? ""} onChange={(description) => setOffer({ ...offer, description })} title={offer.title} category={offer.category} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Cena brutto</span><input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={offer.price_gross} onChange={(e) => setOffer({ ...offer, price_gross: Number(e.target.value) })} /></label>
            <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Stan / dostępność</span><input type="number" min="0" className={inputClass} style={inputStyle} value={offer.stock} onChange={(e) => setOffer({ ...offer, stock: Number(e.target.value) })} /></label>
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

    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
      <button disabled={saving || uploading} onClick={save} className="rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{saving ? "Zapisuję…" : "Zapisz ofertę i zdjęcia"}</button>
      <Link to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`} className="rounded-xl px-5 py-3 text-center font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Dalej: booking →</Link>
    </div>
  </Shell>;
}

function Card({ children }: { children: React.ReactNode }) { return <section className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</section>; }
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>; }
