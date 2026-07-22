import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMySeller } from "../lib/payments";
import {
  becomeSeller, myOffers, createOffer, topCategories, childCategories, uploadProductImage,
  mySubscription, promoteOffer, sellerOrders, markShipped, sellerWallet, sellerSummary, walletHistory, adRates, adBuy, genDescription,
  type SellerWallet,
} from "../lib/api";
import { setMode } from "../lib/mode";

const zl = (v: number) => Math.round(Number(v || 0)).toLocaleString("pl-PL") + " zł";
const dt = (s: string) => new Date(s).toLocaleString("pl-PL");
const opLabel: Record<string, string> = { topup: "Doładowanie", payment: "Zakup", cashback: "Cashback", refund: "Zwrot", payout: "Wpływ ze sprzedaży" };
type Cat = { id: string; slug: string; name: string };
type Off = { offer_id: string; title: string; price_gross: number; stock: number; status: string; category: string };
type Tab = "pulpit" | "oferty" | "zamowienia" | "reklamy" | "portfel";
const TABS: { id: Tab; label: string }[] = [
  { id: "pulpit", label: "📊 Pulpit" },
  { id: "oferty", label: "📦 Oferty" },
  { id: "zamowienia", label: "🧾 Zamówienia" },
  { id: "reklamy", label: "📣 Reklamy" },
  { id: "portfel", label: "💳 Portfel" },
];

export default function Sprzedawca() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("pulpit");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legalName, setLegalName] = useState(""); const [nip, setNip] = useState(""); const [accept, setAccept] = useState(false);

  async function refreshSeller() { const s = await getMySeller(); setSeller(s); }
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true); await refreshSeller();
    });
  }, []);

  async function onBecome(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!accept) { setMsg("Zaakceptuj Regulamin sprzedawcy i Regulamin Sunrise Pay."); return; }
    setBusy(true);
    try { await becomeSeller(legalName, nip, accept); await refreshSeller(); setMsg("Konto sprzedawcy aktywne."); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg px-3 py-2 outline-none";
  const inpStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as React.CSSProperties;

  if (authed === false) return <Shell><p style={{ color: "var(--mut)" }}>Zaloguj się, aby wystawiać oferty. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p></Shell>;
  if (authed === null) return <Shell><p style={{ color: "var(--mut)" }}>Ładowanie…</p></Shell>;

  return (
    <Shell tabs={seller ? { tab, setTab } : undefined}>
      <h1 className="font-display text-3xl font-semibold mb-6">Centrum sprzedawcy</h1>
      {msg && <div className="mb-5 rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>{msg}</div>}

      {!seller ? (
        <form onSubmit={onBecome} className="max-w-md rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <h2 className="font-semibold text-lg">Zostań sprzedawcą</h2>
          <input className={inp} style={inpStyle} placeholder="Nazwa firmy" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
          <input className={inp} style={inpStyle} placeholder="NIP (opcjonalnie)" value={nip} onChange={(e) => setNip(e.target.value)} />
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--mut)" }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
            <span>Akceptuję <a href="/legal/regulamin-sprzedawcy.html" target="_blank" className="text-amber-400 underline">Regulamin sprzedawcy</a> oraz <a href="/legal/regulamin.html" target="_blank" className="text-amber-400 underline">Regulamin Sunrise Pay</a> (prowizja 7,9%, wypłata na portfel Sunrise Pay).</span>
          </label>
          <button disabled={busy || !accept} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "…" : "Aktywuj konto sprzedawcy"}</button>
        </form>
      ) : (
        <>
          {tab === "pulpit" && <Pulpit seller={seller} />}
          {tab === "oferty" && <Oferty />}
          {tab === "zamowienia" && <Zamowienia />}
          {tab === "reklamy" && <Reklamy />}
          {tab === "portfel" && <Portfel seller={seller} />}
        </>
      )}
    </Shell>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</div>;
}
function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs mb-1" style={{ color: "var(--mut)" }}>{label}</div><div className="font-display text-2xl font-semibold" style={{ color: color ?? "var(--ink)" }}>{value}</div></div>;
}

// ── PULPIT ──────────────────────────────────────────────────────────
function Pulpit({ seller }: { seller: any }) {
  const [s, setS] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  useEffect(() => { sellerSummary().then(setS).catch(() => {}); mySubscription().then(setSub).catch(() => {}); }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, rgba(122,184,154,.14), rgba(56,224,240,.10))", border: "1px solid rgba(122,184,154,.3)" }}>
        <div className="text-sm" style={{ color: "var(--mut)" }}>Sprzedaż netto ({seller.legal_name}) — 92,1% po prowizji 7,9%</div>
        <div className="font-display text-4xl font-bold" style={{ color: "var(--green)" }}>{zl(s?.sales_net ?? 0)}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Zamówienia (łącznie)" value={String(s?.orders_total ?? 0)} />
        <Kpi label="Do wysłania" value={String(s?.orders_to_ship ?? 0)} color={s?.orders_to_ship ? "var(--gold)" : undefined} />
        <Kpi label="Oferty aktywne" value={String(s?.offers_count ?? 0)} />
        <Kpi label="Oferty ukryte" value={String(s?.offers_hidden ?? 0)} />
      </div>
      {sub && (
        <Card>
          <span className="text-sm" style={{ color: "var(--mut)" }}>Subskrypcja Sunrise Pay:{" "}
            {sub.in_free ? <b style={{ color: "var(--green)" }}>darmowa do {sub.promo_until} ({sub.days_left} dni)</b> : <b style={{ color: "var(--gold)" }}>{Number(sub.monthly_fee).toFixed(0)} zł/mc</b>}
          </span>
        </Card>
      )}
    </div>
  );
}

// ── OFERTY ──────────────────────────────────────────────────────────
function Oferty() {
  const [offers, setOffers] = useState<Off[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [price, setPrice] = useState(0); const [stock, setStock] = useState(1);
  const [imageUrl, setImageUrl] = useState(""); const [uploading, setUploading] = useState(false);
  const [d1, setD1] = useState<Cat[]>([]); const [d2, setD2] = useState<Cat[]>([]); const [d3, setD3] = useState<Cat[]>([]);
  const [s1, setS1] = useState<Cat | null>(null); const [s2, setS2] = useState<Cat | null>(null); const [s3, setS3] = useState<Cat | null>(null);
  const chosen = s3 ?? s2 ?? s1;

  async function load() { setOffers((await myOffers()) as Off[]); }
  useEffect(() => { load(); topCategories().then((c) => setD1(c as Cat[])); }, []);
  async function pick1(slug: string) { const c = d1.find((x) => x.slug === slug) ?? null; setS1(c); setS2(null); setS3(null); setD2([]); setD3([]); if (c) setD2((await childCategories(c.id)) as Cat[]); }
  async function pick2(slug: string) { const c = d2.find((x) => x.slug === slug) ?? null; setS2(c); setS3(null); setD3([]); if (c) setD3((await childCategories(c.id)) as Cat[]); }
  function pick3(slug: string) { setS3(d3.find((x) => x.slug === slug) ?? null); }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; setUploading(true); setMsg(null); try { setImageUrl(await uploadProductImage(f)); } catch (err) { setMsg("Błąd uploadu: " + (err as Error).message); } finally { setUploading(false); } }
  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!chosen) { setMsg("Wybierz kategorię."); return; }
    setBusy(true);
    try { await createOffer({ title, description: desc, price, stock, categorySlug: chosen.slug, imageUrl }); setTitle(""); setDesc(""); setPrice(0); setStock(1); setImageUrl(""); await load(); setMsg("Oferta wystawiona ✅"); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function onPromote(id: string) { setMsg(null); try { const cost = await promoteOffer(id, 7); setMsg(`Wyróżniono na 7 dni za ${cost} zł.`); await load(); } catch (e) { setMsg((e as Error).message); } }

  const inp = "w-full rounded-lg px-3 py-2 outline-none";
  const inpStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as React.CSSProperties;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onCreate} className="rounded-2xl p-5 flex flex-col gap-3 h-fit" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <h2 className="font-semibold text-lg">Wystaw ofertę</h2>
        {msg && <div className="text-sm" style={{ color: "var(--gold)" }}>{msg}</div>}
        <input className={inp} style={inpStyle} placeholder="Nazwa produktu" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className={inp} style={inpStyle} placeholder="Opis" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
        <button type="button" disabled={busy} onClick={async () => { if (!title) { setMsg("Najpierw wpisz nazwę produktu."); return; } setBusy(true); try { setDesc(await genDescription(title, chosen?.name)); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }} className="text-xs px-3 py-1.5 rounded-lg self-start disabled:opacity-50" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.5)", color: "var(--gold)" }}>✨ Generuj opis AI</button>
        <div className="flex gap-3">
          <input className={inp} style={inpStyle} type="number" min={0} step="0.01" placeholder="Cena zł" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} required />
          <input className={inp} style={inpStyle} type="number" min={0} placeholder="Sztuk" value={stock} onChange={(e) => setStock(Number(e.target.value))} />
        </div>
        <select className={inp} style={inpStyle} value={s1?.slug ?? ""} onChange={(e) => pick1(e.target.value)} required>
          <option value="">— Dział —</option>{d1.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        {d2.length > 0 && <select className={inp} style={inpStyle} value={s2?.slug ?? ""} onChange={(e) => pick2(e.target.value)}><option value="">— Podkategoria —</option>{d2.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
        {d3.length > 0 && <select className={inp} style={inpStyle} value={s3?.slug ?? ""} onChange={(e) => pick3(e.target.value)}><option value="">— Szczegółowa —</option>{d3.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
        <div className="flex items-center gap-3">
          <label className="text-sm cursor-pointer rounded-lg px-3 py-2" style={inpStyle}>{uploading ? "Wgrywam…" : imageUrl ? "Zmień zdjęcie" : "📷 Dodaj zdjęcie"}<input type="file" accept="image/*" onChange={onPickImage} className="hidden" /></label>
          {imageUrl && <img src={imageUrl} alt="podgląd" className="w-12 h-12 rounded-lg object-cover" />}
        </div>
        <p className="text-xs" style={{ color: "var(--mut)" }}>Kategoria: {chosen?.name ?? "—"}. Prowizja 7,9%, wypłata netto (92,1%) na portfel Sunrise Pay.</p>
        <button disabled={busy || uploading} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>{busy ? "…" : "Wystaw"}</button>
      </form>
      <div>
        <h2 className="font-semibold text-lg mb-3">Twoje oferty ({offers.length})</h2>
        <div className="flex flex-col gap-2">
          {offers.map((o) => (
            <div key={o.offer_id} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="flex-1 min-w-0"><a href={`/produkt/${o.offer_id}`} className="font-medium hover:text-amber-300">{o.title}</a><div className="text-xs" style={{ color: "var(--mut)" }}>{o.category} · {o.stock} szt. · {o.status === "hidden" ? "ukryta" : "aktywna"}</div></div>
              <button onClick={() => onPromote(o.offer_id)} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>✨ Promuj</button>
              <div className="font-display text-lg font-semibold whitespace-nowrap">{zl(o.price_gross)}</div>
            </div>
          ))}
          {offers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert. Wystaw pierwszą po lewej.</p>}
        </div>
      </div>
    </div>
  );
}

// ── ZAMÓWIENIA ──────────────────────────────────────────────────────
function Zamowienia() {
  const [sorders, setSorders] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setSorders((await sellerOrders().catch(() => [])) as any[]); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function onShip(id: string) { setMsg(null); try { const t = await markShipped(id); setMsg("Oznaczono wysłane. Nr przesyłki: " + t); await load(); } catch (e) { setMsg((e as Error).message); } }
  if (loading) return <p style={{ color: "var(--mut)" }}>Ładowanie…</p>;
  return (
    <div className="flex flex-col gap-3">
      {msg && <div className="rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>{msg}</div>}
      {sorders.map((o) => (
        <Card key={o.order_id}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: "var(--mut)" }}>{dt(o.created_at)} · {({ paid: "Opłacone", shipped: "Wysłane", delivered: "Dostarczone", completed: "Zakończone" } as any)[o.status] ?? o.status}{o.tracking_no ? ` · ${o.tracking_no}` : ""}</span>
            {o.status === "paid" ? <button onClick={() => onShip(o.order_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Oznacz wysłane</button> : <span className="text-xs" style={{ color: "var(--green)" }}>✓</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            {(o.items ?? []).map((it: any, i: number) => <div key={i} className="flex justify-between text-sm"><span>{it.title} × {it.qty}</span><span style={{ color: "var(--mut)" }}>{zl(it.payout)}</span></div>)}
          </div>
          <div className="text-right text-sm mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>Twoje netto: <b style={{ color: "var(--green)" }}>{zl(o.my_total)}</b></div>
        </Card>
      ))}
      {sorders.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień.</p>}
    </div>
  );
}

// ── PORTFEL ─────────────────────────────────────────────────────────
function Portfel({ seller }: { seller: any }) {
  const [w, setW] = useState<SellerWallet>({ available: false });
  const [ops, setOps] = useState<any[]>([]);
  useEffect(() => { sellerWallet().then(setW).catch(() => {}); walletHistory().then(setOps).catch(() => {}); }, []);
  return (
    <div className="flex flex-col gap-4">
      <Card className="ring-1 ring-emerald-500/20">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm" style={{ color: "var(--mut)" }}>Portfel partnera ({seller.legal_name}) — wpływy ze sprzedaży</div>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: w.available ? "rgba(122,184,154,.15)" : "rgba(56,224,240,.12)", color: w.available ? "var(--green)" : "#8fe3ef" }}>{w.available ? "Sunrise Pay: połączony" : "wypłaty wkrótce"}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><div className="text-xs" style={{ color: "var(--mut)" }}>Sunrise Pay</div><div className="font-display text-2xl font-semibold" style={{ color: "var(--green)" }}>{zl(w.available ? (w.sunrise_pay ?? 0) : 0)}</div></div>
          {w.available && w.gold != null && <div><div className="text-xs" style={{ color: "var(--mut)" }}>Gold Pay</div><div className="font-display text-2xl font-semibold" style={{ color: "#E8C896" }}>{w.gold.toLocaleString("pl-PL")} <span className="text-base">g</span></div></div>}
          {w.available && <div><div className="text-xs" style={{ color: "var(--mut)" }}>W rozliczeniu</div><div className="font-display text-2xl font-semibold" style={{ color: "var(--gold)" }}>{zl(w.pending ?? 0)}</div></div>}
          <div className="flex items-end">
            {w.available && w.withdraw_enabled
              ? <button onClick={() => alert("Wypłata inicjowana po stronie MySunrise (KYC, limity).")} className="text-sm rounded-lg px-4 py-2 font-semibold text-black w-full" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>Przelej / wypłać</button>
              : <button disabled title="Dostępne po uruchomieniu modułu wypłat w MySunrise" className="text-sm rounded-lg px-4 py-2 w-full opacity-60 cursor-not-allowed" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wypłać — wkrótce</button>}
          </div>
        </div>
        <div className="text-xs mt-3" style={{ color: "var(--mut)" }}>{w.available ? "Wpływy ze sprzedaży trafiają tu w walucie zapłaty kupującego (Sunrise Pay lub Gold). Wypłatę na konto realizuje MySunrise." : "Po sprzedaży dostajesz zapłatę netto (92,1%) na portfel. Wypłata na konto i saldo Gold ruszą, gdy MySunrise wystawi moduł wypłat."}</div>
      </Card>
      <div>
        <h2 className="font-semibold mb-2">Historia portfela</h2>
        <div className="flex flex-col">
          {ops.map((o, i) => (
            <div key={i} className="flex justify-between py-2 text-sm" style={{ borderBottom: "1px solid var(--line)" }}>
              <span style={{ color: "var(--mut)" }}>{opLabel[o.type] ?? o.type} · {dt(o.created_at)}</span>
              <span style={{ color: Number(o.amount) >= 0 ? "var(--green)" : "#F8A8D2" }}>{Number(o.amount) >= 0 ? "+" : ""}{zl(o.amount)}</span>
            </div>
          ))}
          {ops.length === 0 && <p className="py-2 text-sm" style={{ color: "var(--mut)" }}>Brak operacji.</p>}
        </div>
      </div>
    </div>
  );
}

function Shell({ children, tabs }: { children: React.ReactNode; tabs?: { tab: Tab; setTab: (t: Tab) => void } }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <button onClick={() => { setMode("buyer"); window.location.href = "/"; }} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>🛍️ Konto klienta</button>
          <a href="/konto" className="text-sm navlink">Konto</a>
        </div>
        {tabs && (
          <div className="mx-auto max-w-5xl px-4 pb-2 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => tabs.setTab(t.id)} className="shrink-0 text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={tabs.tab === t.id ? { background: "linear-gradient(135deg,#7AB89A,#38E0F0)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>{t.label}</button>
            ))}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

// ── REKLAMY ──
function Reklamy() {
  const [rates, setRates] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [sel, setSel] = useState(""); const [rate, setRate] = useState(""); const [budget, setBudget] = useState(20);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { adRates().then((d: any) => setRates(d ?? [])).catch(() => {}); myOffers().then((d: any) => setOffers(d ?? [])).catch(() => {}); }, []);
  const chosen = rates.find((r) => r.code === rate);
  async function buy() {
    if (!sel || !rate) { setMsg("Wybierz produkt i typ reklamy."); return; }
    setBusy(true); setMsg(null);
    try { const r: any = await adBuy(rate, sel, budget); if (r?.need_topup) setMsg(`Za mało środków — potrzeba ${r.required} zł.`); else setMsg("Reklama uruchomiona! ✅"); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="font-semibold mb-1">📣 Reklamy — promuj swoje produkty</div>
        <p className="text-xs mb-3" style={{ color: "var(--mut)" }}>Cennik konkurencyjny względem Allegro Ads. Marki własne Sunrise są sponsorowane bez opłat.</p>
        <div className="grid gap-2 mb-3">
          {rates.map((r) => (
            <label key={r.code} className="flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--glass)", border: rate === r.code ? "1px solid rgba(200,150,90,.6)" : "1px solid var(--line)" }}>
              <span className="text-sm"><input type="radio" name="adrate" checked={rate === r.code} onChange={() => setRate(r.code)} className="mr-2" />{r.name}</span>
              <span className="text-sm font-semibold" style={{ color: "var(--gold)" }}>{r.model === "cpc" ? `${r.price} zł/klik` : `${Math.round(r.price)} zł`}</span>
            </label>
          ))}
        </div>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm mb-2 bg-zinc-900 outline-none">
          <option value="">— wybierz produkt —</option>
          {offers.map((o) => <option key={o.offer_id} value={o.offer_id}>{o.title}</option>)}
        </select>
        {chosen?.model === "cpc" && <div className="mb-2 text-sm">Budżet: <input type="number" min={20} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-24 rounded px-2 py-1 bg-zinc-900 outline-none" /> zł</div>}
        <button onClick={buy} disabled={busy} className="text-sm font-semibold px-4 py-2 rounded-xl text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Uruchamiam…" : "Uruchom reklamę"}</button>
        {msg && <div className="mt-2 text-sm" style={{ color: "var(--gold)" }}>{msg}</div>}
      </Card>
    </div>
  );
}
