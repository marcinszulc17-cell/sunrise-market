import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { childCategories, configureBookingOffer, genDescription, mySeller, topCategories, uploadProductImage } from "../lib/api";

type Cat = { id: string; slug: string; name: string };
type AttrDef = { key: string; label: string; data_type: "text" | "number" | "bool" | "enum"; required: boolean; options: unknown };
type CommissionModel = "cashback_only" | "mlm_full";
type PurchaseMode = "purchase" | "appointment" | "daily";

const inputClass = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

const TYPE_CONFIG: Record<string, { icon: string; title: string; subtitle: string; root?: string; fixedCategory?: string }> = {
  samochod: { icon: "🚗", title: "Wystaw samochód", subtitle: "Sprzedaż albo wynajem auta — wybierasz model oferty, a Market dopasuje dalszy proces.", root: "motoryzacja", fixedCategory: "motoryzacja-samochody-osobowe" },
  nieruchomosc: { icon: "🏠", title: "Wystaw nieruchomość", subtitle: "Sprzedaż lub rezerwacja pobytu / wynajmu na dni w jednym formularzu.", root: "nieruchomosci" },
  usluga: { icon: "🛠️", title: "Wystaw usługę", subtitle: "Usługa może być kupowana od razu albo rezerwowana na konkretny termin — jak w Booksy.", root: "uslugi-i-reklama" },
  lokalne: { icon: "📍", title: "Dodaj ogłoszenie lokalne", subtitle: "Krótko, prosto i bez pól sklepowych, których nie potrzebujesz.", root: "ogloszenia-lokalne" },
};

function allowedModes(type: string): PurchaseMode[] {
  if (type === "samochod" || type === "nieruchomosc") return ["purchase", "daily"];
  if (type === "usluga") return ["appointment", "purchase"];
  return ["purchase"];
}
function modeName(mode: PurchaseMode) {
  if (mode === "appointment") return "Usługa z terminem";
  if (mode === "daily") return "Wynajem na dni";
  return "Zwykła sprzedaż";
}
function modeDescription(mode: PurchaseMode) {
  if (mode === "appointment") return "Klient wybiera usługę, dzień i godzinę, a następnie płaci za rezerwację.";
  if (mode === "daily") return "Klient wybiera datę od–do, widzi cenę za okres i opłaca rezerwację.";
  return "Klient kupuje ofertę bez wybierania terminu w kalendarzu.";
}

export default function DedicatedOfferWizard() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const type = sp.get("typ") || "samochod";
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.samochod;
  const requestedMode = sp.get("mode") as PurchaseMode | null;
  const modes = allowedModes(type);
  const initialMode: PurchaseMode = requestedMode && modes.includes(requestedMode) ? requestedMode : (type === "usluga" ? "appointment" : "purchase");

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [category, setCategory] = useState<Cat | null>(null);
  const [defs, setDefs] = useState<AttrDef[]>([]);
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [commissionModel, setCommissionModel] = useState<CommissionModel>("cashback_only");
  const [fullVatInvoice, setFullVatInvoice] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>(initialMode);

  useEffect(() => { setPurchaseMode(requestedMode && modes.includes(requestedMode) ? requestedMode : (type === "usluga" ? "appointment" : "purchase")); }, [type, requestedMode]);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      try { setSeller(await mySeller()); } catch { setSeller(null); }
      try {
        const roots = (await topCategories()) as Cat[];
        const root = roots.find(c => c.slug === cfg.root);
        if (!root) return;
        if (cfg.fixedCategory) {
          const children = (await childCategories(root.id)) as Cat[];
          setCategory(children.find(c => c.slug === cfg.fixedCategory) || null);
        } else {
          const children = (await childCategories(root.id)) as Cat[];
          if (children.length) setCats(children); else setCategory(root);
        }
      } catch { /* empty selector */ }
    });
  }, [type]);
  useEffect(() => {
    if (!category) { setDefs([]); return; }
    supabase.from("category_attributes").select("key,label,data_type,required,options").eq("category_id", category.id).order("label").then(({ data }) => setDefs((data ?? []) as AttrDef[]));
  }, [category?.id]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(0, 15 - images.length));
    setUploading(true); setMsg(null);
    try { const uploaded: string[] = []; for (const file of picked) uploaded.push(await uploadProductImage(file)); setImages(prev => [...prev, ...uploaded].slice(0, 15)); }
    catch (e) { setMsg("Błąd zdjęcia: " + (e as Error).message); }
    finally { setUploading(false); }
  }
  async function aiDescription() {
    if (!title.trim()) { setMsg("Najpierw wpisz tytuł."); return; }
    setAiBusy(true); setMsg(null);
    try { setDescription(await genDescription(title, category?.name, type)); } catch (e) { setMsg((e as Error).message); } finally { setAiBusy(false); }
  }

  const missing = defs.filter(d => d.required && String(attrs[d.key] ?? "").trim() === "");
  const score = useMemo(() => {
    let n = 20; if (category) n += 10; if (title.length >= 12) n += 15; if (description.length >= 80) n += 15; if (price > 0) n += 15; if (images.length >= 1) n += 10; if (images.length >= 6) n += 5; if (!missing.length) n += 10; return Math.min(100, n);
  }, [category, title, description, price, images.length, missing.length]);

  async function publish() {
    if (!category) { setMsg("Wybierz kategorię."); setStep(1); return; }
    if (!title.trim()) { setMsg("Podaj tytuł."); setStep(1); return; }
    if (price <= 0) { setMsg("Podaj cenę."); setStep(3); return; }
    if (missing.length) { setMsg("Uzupełnij: " + missing.map(x => x.label).join(", ")); setStep(1); return; }
    setBusy(true); setMsg(null);
    try {
      const desc = fullVatInvoice && !description.toLowerCase().includes("faktura vat") ? `${description.trim()}\n\n✅ Wystawiana jest pełna faktura VAT.`.trim() : description.trim();
      const { data, error } = await supabase.rpc("create_offer_v2", {
        p_title: title.trim(), p_description: desc, p_price: price, p_stock: 1, p_category_slug: category.slug, p_image_urls: images, p_commission_model: commissionModel,
        p_attributes: { ...attrs, offer_type: type, purchase_mode: purchaseMode, full_vat_invoice: fullVatInvoice },
      });
      if (error) throw error;
      const offerId = String(data || ""); if (!offerId) throw new Error("Oferta powstała, ale nie otrzymano jej ID.");
      if (purchaseMode !== "purchase") {
        await configureBookingOffer({ offerId, bookingType: purchaseMode === "daily" ? "daily" : "appointment", durationMinutes: purchaseMode === "appointment" ? 60 : null, slotIntervalMinutes: 30, minNoticeHours: 2, maxAdvanceDays: 365, maxUnits: purchaseMode === "daily" ? 60 : 1, pricePerUnit: price, active: false });
        navigate(`/sprzedawca/rezerwacje/ustawienia/${offerId}?new=1`); return;
      }
      setMsg("Oferta została opublikowana ✅"); setStep(4);
    } catch (e) { setMsg("Nie udało się opublikować: " + (e as Error).message); }
    finally { setBusy(false); }
  }

  if (authed === null) return <Shell><p>Ładowanie…</p></Shell>;
  if (authed === false) return <Shell><p>Zaloguj się, aby wystawić ofertę. <Link to="/login" className="underline text-amber-400">Logowanie</Link></p></Shell>;
  if (!seller) return <Shell><Card><h2 className="text-xl font-semibold">Najpierw aktywuj konto sprzedawcy</h2><Link to="/sprzedawca-klasyczny" className="mt-4 inline-flex underline">Przejdź do aktywacji →</Link></Card></Shell>;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="text-4xl">{cfg.icon}</div><h1 className="mt-2 font-display text-3xl font-semibold">{cfg.title}</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{cfg.subtitle}</p></div><Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Zmień typ oferty</Link></div>
    {msg && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>{msg}</div>}
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <Card>
        <div className="mb-6 grid grid-cols-3 gap-2 text-center text-xs">{["Dane", "Zdjęcia i opis", "Cena i publikacja"].map((x, i) => <button key={x} onClick={() => setStep(i + 1)} className="rounded-lg px-2 py-2 font-semibold" style={{ background: step === i + 1 ? "rgba(200,150,90,.18)" : "var(--glass)", color: step === i + 1 ? "var(--gold)" : "var(--mut)" }}>{i + 1}. {x}</button>)}</div>
        {step === 1 && <div className="space-y-4">{modes.length > 1 && <div><div className="mb-2 text-sm font-semibold">Jak klient ma kupować tę ofertę?</div><div className="grid gap-2 sm:grid-cols-2">{modes.map(mode => <button type="button" key={mode} onClick={() => setPurchaseMode(mode)} className="rounded-2xl p-4 text-left" style={{ background: purchaseMode === mode ? "rgba(200,150,90,.14)" : "var(--glass)", border: purchaseMode === mode ? "1px solid var(--gold)" : "1px solid var(--line)" }}><div className="font-semibold">{mode === "appointment" ? "📅 " : mode === "daily" ? "🗓️ " : "🛒 "}{modeName(mode)}</div><div className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>{modeDescription(mode)}</div></button>)}</div></div>}{!cfg.fixedCategory && cats.length > 0 && <label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Kategoria *</span><select className={inputClass} style={inputStyle} value={category?.slug || ""} onChange={e => setCategory(cats.find(c => c.slug === e.target.value) || null)}><option value="">Wybierz</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>}<label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Tytuł *</span><input className={inputClass} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder={type === "samochod" ? "np. Ford Fiesta 1.0 80 KM 2013" : "Krótki, konkretny tytuł"}/></label>{defs.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{defs.map(d => <Field key={d.key} def={d} value={attrs[d.key]} onChange={v => setAttrs(p => ({ ...p, [d.key]: v }))}/>)}</div>}{type === "samochod" && <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(122,184,154,.10)", color: "var(--mut)" }}>Pola typu marka, model, VIN, przebieg, paliwo, nadwozie, wyposażenie i historia pojawiają się automatycznie dla samochodów.</div>}</div>}
        {step === 2 && <div className="space-y-4"><div><div className="mb-2 flex items-center justify-between"><span className="font-semibold">Zdjęcia ({images.length}/15)</span><span className="text-xs" style={{ color: "var(--mut)" }}>Pierwsze = główne</span></div><label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-6 text-sm" style={{ borderColor: "var(--line)" }}>{uploading ? "Wysyłanie…" : "+ Dodaj zdjęcia"}<input className="hidden" type="file" accept="image/*" multiple onChange={e => uploadFiles(e.target.files)}/></label>{images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((url, i) => <div key={url} className="relative"><img src={url} className="aspect-square w-full rounded-lg object-cover" alt=""/><button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-xs text-white">×</button>{i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Główne</span>}</div>)}</div>}</div><div className="flex items-center justify-between"><span className="font-semibold">Opis</span><button type="button" onClick={aiDescription} disabled={aiBusy} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--line)" }}>{aiBusy ? "Tworzę…" : "✨ Napisz opis AI"}</button></div><textarea rows={9} className={inputClass} style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Stan, najważniejsze informacje, zalety, warunki sprzedaży…"/></div>}
        {step === 3 && <div className="space-y-5"><div className="rounded-xl p-4" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)" }}><div className="font-semibold">{modeName(purchaseMode)}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{modeDescription(purchaseMode)}</div></div><label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{purchaseMode === "daily" ? "Cena za dzień" : purchaseMode === "appointment" ? "Cena terminu / usługi" : "Cena brutto"} *</span><input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={price || ""} onChange={e => setPrice(Number(e.target.value))}/></label><Toggle title="Prowizje Ambassador Club" subtitle={commissionModel === "cashback_only" ? "Wyłączone: klient dostaje cashback, bez prowizji ambasadorskich." : "Włączone: cashback + prowizje za polecenie."} checked={commissionModel === "mlm_full"} onChange={v => setCommissionModel(v ? "mlm_full" : "cashback_only")}/><Toggle title="Pełna faktura VAT" subtitle="Pokaż klientowi informację o pełnej fakturze VAT." checked={fullVatInvoice} onChange={setFullVatInvoice}/><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{images[0] && <img src={images[0]} className="h-56 w-full object-cover" alt=""/>}<div className="p-4"><div className="text-xs" style={{ color: "var(--mut)" }}>{category?.name}</div><div className="mt-1 text-xl font-semibold">{title || "Tytuł oferty"}</div><div className="mt-2 text-2xl font-bold" style={{ color: "var(--gold)" }}>{price.toLocaleString("pl-PL", { style: "currency", currency: "PLN" })}{purchaseMode === "daily" ? " / dzień" : ""}</div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full px-2 py-1" style={{ background: "rgba(122,184,154,.12)" }}>3% cashback</span>{purchaseMode !== "purchase" && <span className="rounded-full px-2 py-1" style={{ background: "rgba(56,224,240,.10)" }}>📅 Rezerwacja online</span>}{commissionModel === "mlm_full" && <span className="rounded-full px-2 py-1" style={{ background: "rgba(200,150,90,.14)" }}>Ambassador Club</span>}{fullVatInvoice && <span className="rounded-full px-2 py-1" style={{ background: "rgba(56,224,240,.10)" }}>Pełna faktura VAT</span>}</div></div></div>{purchaseMode !== "purchase" && <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.18)" }}>Po utworzeniu oferty booking pozostanie niewidoczny dla klientów, dopóki nie ustawisz dostępności i go nie aktywujesz.</div>}<button onClick={publish} disabled={busy} className="w-full rounded-xl py-3 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Publikuję…" : purchaseMode === "purchase" ? "Opublikuj ofertę" : "Utwórz i ustaw kalendarz →"}</button></div>}
        {step === 4 && <div className="py-12 text-center"><div className="text-5xl">✅</div><h2 className="mt-4 text-2xl font-semibold">Oferta opublikowana</h2><div className="mt-5 flex flex-wrap justify-center gap-3"><Link to="/sprzedawca/oferty" className="rounded-xl px-4 py-2" style={{ border: "1px solid var(--line)" }}>Moje oferty</Link><Link to="/" className="rounded-xl px-4 py-2" style={{ border: "1px solid var(--line)" }}>Zobacz Market</Link><Link to="/sprzedawca" className="rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Dodaj kolejną</Link></div></div>}
        {step < 4 && <div className="mt-6 flex justify-between"><button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="rounded-xl px-4 py-2 text-sm disabled:opacity-30" style={{ border: "1px solid var(--line)" }}>← Wstecz</button>{step < 3 && <button type="button" onClick={() => setStep(s => s + 1)} className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Dalej →</button>}</div>}
      </Card>
      <Card><div className="text-sm font-semibold">Jakość oferty</div><div className="mt-2 text-4xl font-bold" style={{ color: score >= 80 ? "var(--green)" : "var(--gold)" }}>{score}/100</div><div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--glass)" }}><div className="h-full" style={{ width: `${score}%`, background: "linear-gradient(90deg,#C8965A,#7AB89A)" }}/></div><div className="mt-4 space-y-1 text-xs" style={{ color: "var(--mut)" }}><div>{images.length >= 6 ? "✅" : "○"} minimum 6 zdjęć</div><div>{description.length >= 80 ? "✅" : "○"} dobry opis</div><div>{missing.length === 0 ? "✅" : "○"} wymagane parametry</div><div>{price > 0 ? "✅" : "○"} cena</div></div>{purchaseMode !== "purchase" && <div className="mt-5 rounded-xl p-3 text-xs" style={{ background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.18)", color: "var(--mut)" }}>Najpierw ustaw kalendarz i dostępność. Booking pojawi się klientom dopiero po aktywacji.</div>}</Card>
    </div>
  </Shell>;
}

function Field({ def, value, onChange }: { def: AttrDef; value: any; onChange: (v: any) => void }) { const options = Array.isArray(def.options) ? def.options : []; return <label className="text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>{def.label}{def.required ? " *" : ""}</span>{def.data_type === "enum" ? <select className={inputClass} style={inputStyle} value={value ?? ""} onChange={e => onChange(e.target.value)}><option value="">Wybierz</option>{options.map((o: any) => <option key={String(o)}>{String(o)}</option>)}</select> : def.data_type === "bool" ? <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/> : <input className={inputClass} style={inputStyle} type={def.data_type === "number" ? "number" : "text"} value={value ?? ""} onChange={e => onChange(def.data_type === "number" ? Number(e.target.value) : e.target.value)}/>}</label>; }
function Toggle({ title, subtitle, checked, onChange }: { title:string; subtitle:string; checked:boolean; onChange:(v:boolean)=>void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl p-4" style={{ border:"1px solid var(--line)" }}><div><div className="font-medium">{title}</div><div className="text-xs" style={{ color:"var(--mut)" }}>{subtitle}</div></div><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</div>; }
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>; }
