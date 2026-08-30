import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  childCategories,
  configureBookingOffer,
  genDescription,
  myOffers,
  mySeller,
  topCategories,
  uploadProductImage,
} from "../lib/api";

type Cat = { id: string; slug: string; name: string };
type AttrDef = { key: string; label: string; data_type: "text" | "number" | "bool" | "enum"; required: boolean; options: unknown };
type Offer = { offer_id: string; title: string; price_gross: number; stock: number; status: string; category: string; commission_model?: string };
type CommissionModel = "cashback_only" | "mlm_full";
type PurchaseMode = "purchase" | "appointment" | "daily";

const DRAFT_KEY = "sunrise_market_offer_draft_v3";
const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

const MODES: { id: PurchaseMode; icon: string; title: string; description: string }[] = [
  { id: "purchase", icon: "🛒", title: "Sprzedaż", description: "Klient kupuje produkt od razu, bez wybierania terminu." },
  { id: "appointment", icon: "⏱️", title: "Rezerwacja terminu", description: "Klient wybiera konkretny dzień i godzinę. Dobre dla sprzętu, stanowisk, atrakcji i wynajmu godzinowego." },
  { id: "daily", icon: "🗓️", title: "Wynajem na dni", description: "Klient wybiera datę od–do i płaci za cały okres. Dobre dla rowerów, maszyn, przyczep i sprzętu." },
];

export default function SprzedawcaV2() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const requestedMode = sp.get("mode") as PurchaseMode | null;
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<any>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(1);
  const [commissionModel, setCommissionModel] = useState<CommissionModel>("cashback_only");
  const [fullVatInvoice, setFullVatInvoice] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>(requestedMode && MODES.some(m => m.id === requestedMode) ? requestedMode : "purchase");

  const [d1, setD1] = useState<Cat[]>([]);
  const [d2, setD2] = useState<Cat[]>([]);
  const [d3, setD3] = useState<Cat[]>([]);
  const [s1, setS1] = useState<Cat | null>(null);
  const [s2, setS2] = useState<Cat | null>(null);
  const [s3, setS3] = useState<Cat | null>(null);
  const [attrDefs, setAttrDefs] = useState<AttrDef[]>([]);
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const chosen = s3 ?? s2 ?? s1;

  useEffect(() => {
    if (requestedMode && MODES.some(m => m.id === requestedMode)) setPurchaseMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      try { setSeller(await mySeller()); } catch { setSeller(null); }
      try { setOffers((await myOffers()) as Offer[]); } catch { setOffers([]); }
      try { setD1((await topCategories()) as Cat[]); } catch { setD1([]); }
    });
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setTitle(d.title || ""); setDescription(d.description || ""); setPrice(Number(d.price || 0)); setStock(Number(d.stock || 1));
        setCommissionModel(d.commissionModel === "mlm_full" ? "mlm_full" : "cashback_only");
        setFullVatInvoice(Boolean(d.fullVatInvoice)); setImages(Array.isArray(d.images) ? d.images : []); setAttrs(d.attrs || {});
        if (MODES.some(m => m.id === d.purchaseMode)) setPurchaseMode(d.purchaseMode);
      }
    } catch { /* ignore draft */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, price, stock, commissionModel, fullVatInvoice, images, attrs, purchaseMode }));
    }, 300);
    return () => clearTimeout(t);
  }, [title, description, price, stock, commissionModel, fullVatInvoice, images, attrs, purchaseMode]);

  useEffect(() => {
    if (!chosen) { setAttrDefs([]); return; }
    supabase.from("category_attributes").select("key,label,data_type,required,options").eq("category_id", chosen.id).order("label")
      .then(({ data }) => setAttrDefs((data ?? []) as AttrDef[]));
  }, [chosen?.id]);

  async function pick1(slug: string) {
    const c = d1.find(x => x.slug === slug) ?? null; setS1(c); setS2(null); setS3(null); setD2([]); setD3([]);
    if (c) setD2((await childCategories(c.id)) as Cat[]);
  }
  async function pick2(slug: string) {
    const c = d2.find(x => x.slug === slug) ?? null; setS2(c); setS3(null); setD3([]);
    if (c) setD3((await childCategories(c.id)) as Cat[]);
  }
  function pick3(slug: string) { setS3(d3.find(x => x.slug === slug) ?? null); }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(0, 12 - images.length));
    setUploading(true); setMsg(null);
    try {
      const uploaded: string[] = [];
      for (const file of picked) uploaded.push(await uploadProductImage(file));
      setImages(prev => [...prev, ...uploaded].slice(0, 12));
    } catch (e) { setMsg("Błąd zdjęcia: " + (e as Error).message); }
    finally { setUploading(false); }
  }

  async function aiDescription() {
    if (!title.trim()) { setMsg("Najpierw wpisz tytuł oferty."); return; }
    setAiBusy(true); setMsg(null);
    try { setDescription(await genDescription(title, chosen?.name, "seller")); }
    catch (e) { setMsg((e as Error).message); }
    finally { setAiBusy(false); }
  }

  const missingRequired = attrDefs.filter(a => a.required && String(attrs[a.key] ?? "").trim() === "");
  const score = useMemo(() => {
    let s = 20;
    if (chosen) s += 15; if (title.trim().length >= 15) s += 15; if (description.trim().length >= 80) s += 15;
    if (price > 0) s += 10; if (images.length >= 1) s += 10; if (images.length >= 5) s += 5; if (!missingRequired.length) s += 10;
    return Math.min(100, s);
  }, [chosen, title, description, price, images.length, missingRequired.length]);

  async function publish() {
    if (!chosen) { setMsg("Wybierz kategorię."); setStep(1); return; }
    if (!title.trim()) { setMsg("Podaj tytuł."); setStep(2); return; }
    if (price <= 0) { setMsg("Podaj cenę większą od 0."); setStep(3); return; }
    if (missingRequired.length) { setMsg("Uzupełnij wymagane dane: " + missingRequired.map(x => x.label).join(", ")); setStep(2); return; }
    setBusy(true); setMsg(null);
    try {
      const desc = fullVatInvoice && !description.includes("pełna faktura VAT")
        ? `${description.trim()}\n\n✅ Na produkt wystawiana jest pełna faktura VAT.`.trim()
        : description.trim();
      const { data, error } = await supabase.rpc("create_offer_v2", {
        p_title: title.trim(),
        p_description: desc,
        p_price: price,
        p_stock: stock,
        p_category_slug: chosen.slug,
        p_image_urls: images,
        p_commission_model: commissionModel,
        p_attributes: { ...attrs, full_vat_invoice: fullVatInvoice, purchase_mode: purchaseMode, offer_type: "product" },
      });
      if (error) throw error;
      const offerId = String(data || "");
      if (!offerId) throw new Error("Oferta powstała, ale nie otrzymano jej ID.");
      localStorage.removeItem(DRAFT_KEY);

      if (purchaseMode !== "purchase") {
        await configureBookingOffer({
          offerId,
          bookingType: purchaseMode === "daily" ? "daily" : "appointment",
          durationMinutes: purchaseMode === "appointment" ? 60 : null,
          slotIntervalMinutes: 30,
          minNoticeHours: 2,
          maxAdvanceDays: 365,
          maxUnits: purchaseMode === "daily" ? Math.max(stock, 1) : 1,
          pricePerUnit: price,
          active: true,
        });
        navigate(`/sprzedawca/rezerwacje/ustawienia/${offerId}?new=1`);
        return;
      }

      setTitle(""); setDescription(""); setPrice(0); setStock(1); setImages([]); setAttrs({}); setFullVatInvoice(false); setCommissionModel("cashback_only"); setPurchaseMode("purchase"); setStep(1);
      setOffers((await myOffers()) as Offer[]);
      setMsg("Oferta została opublikowana ✅");
    } catch (e) { setMsg("Nie udało się opublikować: " + (e as Error).message); }
    finally { setBusy(false); }
  }

  if (authed === null) return <Shell><p style={{ color: "var(--mut)" }}>Ładowanie…</p></Shell>;
  if (authed === false) return <Shell><p>Zaloguj się, aby sprzedawać. <Link className="underline text-amber-400" to="/login">Logowanie</Link></p></Shell>;
  if (!seller) return <Shell><Card><h1 className="text-2xl font-semibold">Najpierw aktywuj konto sprzedawcy</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Po jednorazowej aktywacji wrócisz do nowego kreatora ofert.</p><Link to="/sprzedawca-klasyczny" className="mt-4 inline-flex rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Aktywuj konto</Link></Card></Shell>;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-display text-3xl font-semibold">Wystaw produkt lub sprzęt</h1><p className="text-sm" style={{ color: "var(--mut)" }}>Ta sama oferta może być sprzedawana albo rezerwowana.</p></div>
      <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
    </div>
    {msg && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>{msg}</div>}

    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <div className="mb-5 grid grid-cols-4 gap-2 text-center text-xs">
          {["Typ i kategoria", "Opis i zdjęcia", "Cena i korzyści", "Podgląd"].map((x, i) => <button type="button" key={x} onClick={() => setStep(i + 1)} className="rounded-lg px-2 py-2 font-semibold" style={{ background: step === i + 1 ? "rgba(200,150,90,.18)" : "var(--glass)", color: step === i + 1 ? "var(--gold)" : "var(--mut)" }}>{i + 1}. {x}</button>)}
        </div>

        {step === 1 && <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Jak klient ma korzystać z oferty?</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Możesz sprzedawać lub uruchomić booking praktycznie w każdej kategorii.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">{MODES.map(mode => <button type="button" key={mode.id} onClick={() => setPurchaseMode(mode.id)} className="rounded-2xl p-4 text-left" style={{ background: purchaseMode === mode.id ? "rgba(200,150,90,.14)" : "var(--glass)", border: purchaseMode === mode.id ? "1px solid var(--gold)" : "1px solid var(--line)" }}><div className="text-2xl">{mode.icon}</div><div className="mt-2 font-semibold">{mode.title}</div><div className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>{mode.description}</div></button>)}</div>
          </div>
          <div className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
            <h2 className="text-xl font-semibold">Co wystawiasz?</h2>
            <div className="mt-3 space-y-3">
              <select className={inputClass} style={inputStyle} value={s1?.slug || ""} onChange={e => pick1(e.target.value)}><option value="">Wybierz dział</option>{d1.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
              {d2.length > 0 && <select className={inputClass} style={inputStyle} value={s2?.slug || ""} onChange={e => pick2(e.target.value)}><option value="">Wybierz kategorię</option>{d2.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>}
              {d3.length > 0 && <select className={inputClass} style={inputStyle} value={s3?.slug || ""} onChange={e => pick3(e.target.value)}><option value="">Wybierz podkategorię</option>{d3.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>}
            </div>
            {chosen && <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.28)" }}>Wybrano: <b>{chosen.name}</b></div>}
          </div>
        </div>}

        {step === 2 && <div className="space-y-4">
          <h2 className="text-xl font-semibold">Opis i zdjęcia</h2>
          <input className={inputClass} style={inputStyle} placeholder="Tytuł oferty" value={title} onChange={e => setTitle(e.target.value)} />
          {attrDefs.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{attrDefs.map(a => <label key={a.key} className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{a.label}{a.required ? " *" : ""}</span>{a.data_type === "enum" ? <select className={inputClass} style={inputStyle} value={attrs[a.key] ?? ""} onChange={e => setAttrs(p => ({ ...p, [a.key]: e.target.value }))}><option value="">Wybierz</option>{(Array.isArray(a.options) ? a.options : []).map((o: any) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select> : a.data_type === "bool" ? <input type="checkbox" checked={Boolean(attrs[a.key])} onChange={e => setAttrs(p => ({ ...p, [a.key]: e.target.checked }))} /> : <input type={a.data_type === "number" ? "number" : "text"} className={inputClass} style={inputStyle} value={attrs[a.key] ?? ""} onChange={e => setAttrs(p => ({ ...p, [a.key]: a.data_type === "number" ? Number(e.target.value) : e.target.value }))} />}</label>)}</div>}
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">Opis</span><button type="button" onClick={aiDescription} disabled={aiBusy} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--line)" }}>{aiBusy ? "Tworzę…" : "✨ Wygeneruj opis AI"}</button></div>
          <textarea className={inputClass} style={inputStyle} rows={8} placeholder="Opisz produkt, sprzęt, stan, wyposażenie i zasady korzystania…" value={description} onChange={e => setDescription(e.target.value)} />
          <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Zdjęcia ({images.length}/12)</span><span className="text-xs" style={{ color: "var(--mut)" }}>Pierwsze zdjęcie jest główne</span></div><label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-5 text-sm" style={{ borderColor: "var(--line)" }}>{uploading ? "Wysyłanie…" : "+ Dodaj zdjęcia"}<input className="hidden" type="file" accept="image/*" multiple onChange={e => uploadFiles(e.target.files)} /></label>{images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, i) => <div key={url} className="relative"><img src={url} className="aspect-square w-full rounded-lg object-cover" alt=""/><button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-xs text-white">×</button>{i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Główne</span>}</div>)}</div>}</div>
        </div>}

        {step === 3 && <div className="space-y-5">
          <h2 className="text-xl font-semibold">Cena i korzyści</h2>
          <div className="rounded-xl p-4" style={{ background: "rgba(56,224,240,.07)", border: "1px solid rgba(56,224,240,.18)" }}><div className="font-semibold">{MODES.find(m => m.id === purchaseMode)?.title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{MODES.find(m => m.id === purchaseMode)?.description}</div></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{purchaseMode === "daily" ? "Cena za dzień" : purchaseMode === "appointment" ? "Cena za termin / godzinę" : "Cena brutto"} *</span><input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={price || ""} onChange={e => setPrice(Number(e.target.value))}/></label><label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{purchaseMode === "purchase" ? "Dostępna liczba" : "Liczba dostępnych sztuk / zasobów"}</span><input type="number" min="1" className={inputClass} style={inputStyle} value={stock} onChange={e => setStock(Math.max(1, Number(e.target.value)))}/></label></div>
          <div className="rounded-2xl p-4" style={{ border: "1px solid var(--line)" }}><div className="mb-2 font-semibold">Program poleceń</div><label className="flex cursor-pointer items-center justify-between gap-4"><div><div className="font-medium">Prowizje Ambassador Club</div><div className="text-xs" style={{ color: "var(--mut)" }}>{commissionModel === "cashback_only" ? "Tylko cashback dla kupującego — bez prowizji ambasadorskich." : "Cashback dla kupującego + prowizje za polecenia."}</div></div><input type="checkbox" className="h-5 w-5" checked={commissionModel === "mlm_full"} onChange={e => setCommissionModel(e.target.checked ? "mlm_full" : "cashback_only")}/></label></div>
          <div className="rounded-2xl p-4" style={{ border: "1px solid var(--line)" }}><label className="flex cursor-pointer items-center justify-between gap-4"><div><div className="font-medium">Pełna faktura VAT</div><div className="text-xs" style={{ color: "var(--mut)" }}>Pokaż klientowi wyraźną informację o pełnej fakturze VAT.</div></div><input type="checkbox" className="h-5 w-5" checked={fullVatInvoice} onChange={e => setFullVatInvoice(e.target.checked)}/></label></div>
        </div>}

        {step === 4 && <div className="space-y-4"><h2 className="text-xl font-semibold">Podgląd oferty</h2><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{images[0] && <img src={images[0]} className="h-64 w-full object-cover" alt=""/>}<div className="p-5"><div className="text-sm" style={{ color: "var(--mut)" }}>{chosen?.name || "Brak kategorii"}</div><h3 className="mt-1 text-2xl font-semibold">{title || "Tytuł oferty"}</h3><div className="mt-2 text-2xl font-bold" style={{ color: "var(--gold)" }}>{price.toLocaleString("pl-PL", { style: "currency", currency: "PLN" })}{purchaseMode === "daily" ? " / dzień" : purchaseMode === "appointment" ? " / termin" : ""}</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full px-2 py-1" style={{ background: "rgba(122,184,154,.12)" }}>3% cashback</span>{purchaseMode !== "purchase" && <span className="rounded-full px-2 py-1" style={{ background: "rgba(56,224,240,.10)" }}>📅 Rezerwacja online</span>}{commissionModel === "mlm_full" && <span className="rounded-full px-2 py-1" style={{ background: "rgba(200,150,90,.14)" }}>Prowizje Ambassador Club</span>}{fullVatInvoice && <span className="rounded-full px-2 py-1" style={{ background: "rgba(56,224,240,.10)" }}>Pełna faktura VAT</span>}</div><p className="mt-4 whitespace-pre-wrap text-sm" style={{ color: "var(--mut)" }}>{description || "Brak opisu"}</p></div></div><button type="button" onClick={publish} disabled={busy} className="w-full rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Publikuję…" : purchaseMode === "purchase" ? "Opublikuj ofertę" : "Opublikuj i ustaw kalendarz →"}</button></div>}

        <div className="mt-6 flex justify-between"><button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="rounded-xl px-4 py-2 text-sm disabled:opacity-30" style={{ border: "1px solid var(--line)" }}>← Wstecz</button>{step < 4 && <button type="button" onClick={() => setStep(s => Math.min(4, s + 1))} className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Dalej →</button>}</div>
      </Card>

      <div className="space-y-4"><Card><div className="text-sm font-semibold">Jakość oferty</div><div className="mt-2 text-4xl font-bold" style={{ color: score >= 80 ? "var(--green)" : "var(--gold)" }}>{score}/100</div><div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--glass)" }}><div className="h-full rounded-full" style={{ width: `${score}%`, background: "linear-gradient(90deg,#C8965A,#7AB89A)" }}/></div><ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--mut)" }}><li>{images.length >= 5 ? "✅" : "○"} 5+ zdjęć</li><li>{description.length >= 80 ? "✅" : "○"} pełny opis</li><li>{missingRequired.length === 0 ? "✅" : "○"} wymagane parametry</li><li>{price > 0 ? "✅" : "○"} cena</li></ul>{purchaseMode !== "purchase" && <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: "rgba(56,224,240,.07)", color: "var(--mut)" }}>Po publikacji automatycznie przejdziesz do ustawień kalendarza, dostępności i zasobów.</div>}</Card><Card><div className="text-sm font-semibold">Twoje oferty</div><div className="mt-3 space-y-2">{offers.slice(0, 8).map(o => <div key={o.offer_id} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}><div className="truncate font-medium">{o.title}</div><div className="mt-1 flex justify-between text-xs" style={{ color: "var(--mut)" }}><span>{Number(o.price_gross).toLocaleString("pl-PL")} zł</span><span>{o.status}</span></div></div>)}{offers.length === 0 && <div className="text-xs" style={{ color: "var(--mut)" }}>Brak ofert.</div>}</div></Card></div>
    </div>
  </Shell>;
}

function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</div>; }
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-7xl">{children}</div></main>; }
