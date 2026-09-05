import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMySeller } from "../lib/payments";
import {
  becomeSeller, myOffers, createOffer, topCategories, childCategories, uploadProductImage,
  mySubscription, promoteOffer, sellerOrders, markShipped, sellerWallet, sellerSummary, walletHistory, adRates, adBuy, genDescription,
  myBannerStats,
  type SellerWallet,
} from "../lib/api";
import { setMode } from "../lib/mode";

import { zl } from "../lib/money";
const dt = (s: string) => new Date(s).toLocaleString("pl-PL");
const opLabel: Record<string, string> = { topup: "Doładowanie", payment: "Zakup", cashback: "Cashback", refund: "Zwrot", payout: "Wpływ ze sprzedaży" };
type Cat = { id: string; slug: string; name: string };
type Off = { offer_id: string; title: string; price_gross: number; stock: number; status: string; category: string };
type Tab = "pulpit" | "oferty" | "zamowienia" | "reklamy" | "portfel" | "statystyki" | "wysylka";
const TABS: { id: Tab; label: string }[] = [
  { id: "pulpit", label: "📊 Pulpit" },
  { id: "oferty", label: "📦 Oferty" },
  { id: "zamowienia", label: "🧾 Zamówienia" },
  { id: "reklamy", label: "📣 Promowanie" },
  { id: "statystyki", label: "📈 Statystyki" },
  { id: "wysylka", label: "🚚 Wysyłka" },
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
          <h2 className="font-semibold text-lg">Zostań Partnerem Handlowym (firma)</h2><p className="text-xs" style={{ color: "var(--mut)" }}>Dla firm z NIP: rozbudowane centrum, faktury, saldo firmowe Sunrise Pay i Stripe Connect. Pierwszy rok gratis, potem 499 zł/rok. Sprzedajesz prywatnie? <a href="/sprzedawca/dolacz" className="underline">Wybierz konto Sprzedawcy</a>.</p>
          <input className={inp} style={inpStyle} placeholder="Nazwa firmy" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
          <input className={inp} style={inpStyle} placeholder="NIP firmy (wymagany — tylko firmy mogą sprzedawać)" value={nip}
            onChange={(e) => setNip(e.target.value)}
            onBlur={async () => {
              const clean = nip.replace(/[^0-9]/g, "");
              if (clean.length !== 10) return;
              try {
                const r = await fetch(`https://ihehncaaokbwbdqdztna.supabase.co/functions/v1/nip-lookup?nip=${clean}`);
                const j = await r.json();
                if (j?.ok && j.name) { setLegalName(j.name); setMsg(`Firma z rejestru VAT: ${j.name}${j.address ? " · " + j.address : ""}`); }
                else if (j?.error) setMsg(`NIP: ${j.error}`);
              } catch { /* ignoruj — reczne wpisanie nadal mozliwe */ }
            }} />
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--mut)" }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
            <span>Akceptuję <a href="/legal/regulamin-sprzedawcy.html" target="_blank" className="text-amber-400 underline">Regulamin sprzedawcy</a> oraz <a href="/legal/regulamin.html" target="_blank" className="text-amber-400 underline">Regulamin Sunrise Pay</a> (prowizja 7,9% liczona od ceny brutto, wypłata na portfel Sunrise Pay).</span>
          </label>
          <button disabled={busy || !accept} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "…" : "Aktywuj Partnera Handlowego"}</button>
        </form>
      ) : (
        <>
          {tab === "pulpit" && <Pulpit seller={seller} goTab={setTab} />}
          {tab === "oferty" && <Oferty />}
          {tab === "zamowienia" && <Zamowienia />}
          {tab === "reklamy" && <Reklamy />}
          {tab === "statystyki" && <Statystyki />}
          {tab === "wysylka" && <Wysylka />}
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
function Pulpit({ seller, goTab }: { seller: any; goTab: (t: Tab) => void }) {
  const [s, setS] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  useEffect(() => { sellerSummary().then(setS).catch(() => {}); mySubscription().then(setSub).catch(() => {}); }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, rgba(122,184,154,.14), rgba(56,224,240,.10))", border: "1px solid rgba(122,184,154,.3)" }}>
        <div className="text-sm" style={{ color: "var(--mut)" }}>Twoje wpływy ze sprzedaży ({seller.legal_name}) — 92,1% ceny brutto (prowizja 7,9% od brutto)</div>
        <div className="font-display text-4xl font-bold" style={{ color: "var(--green)" }}>{zl(s?.sales_net ?? 0)}</div>
      </div>
      {s && (Number(s.offers_count || 0) === 0 || Number(s.orders_total || 0) === 0) && (
        <Card>
          <div className="font-semibold mb-3">🚀 Pierwsze kroki</div>
          <div className="flex flex-col gap-2 text-sm">
            {([
              { done: true, label: "Konto sprzedawcy aktywne", tab: null as Tab | null },
              { done: Number(s.offers_count || 0) > 0, label: "Wystaw pierwszą ofertę", tab: "oferty" as Tab | null },
              { done: Number(s.orders_total || 0) > 0, label: "Zdobądź pierwszą sprzedaż", tab: null as Tab | null },
              { done: false, label: "Uruchom reklamę (opcjonalnie)", tab: "reklamy" as Tab | null },
            ]).map((st, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ color: st.done ? "var(--green)" : "var(--mut)" }}>{st.done ? "✅" : "⬜"}</span>
                {st.tab && !st.done
                  ? <button onClick={() => goTab(st.tab as Tab)} className="underline" style={{ color: "var(--gold)" }}>{st.label} →</button>
                  : <span style={{ color: st.done ? "var(--mut)" : "var(--ink)" }}>{st.label}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Zamówienia (łącznie)" value={String(s?.orders_total ?? 0)} />
        <Kpi label="Do wysłania" value={String(s?.orders_to_ship ?? 0)} color={s?.orders_to_ship ? "var(--gold)" : undefined} />
        <Kpi label="Oferty aktywne" value={String(s?.offers_count ?? 0)} />
        <Kpi label="Oferty ukryte" value={String(s?.offers_hidden ?? 0)} />
      </div>
      {sub && (
        <Card>
          <span className="text-sm" style={{ color: "var(--mut)" }}>Subskrypcja Sunrise Pay:{" "}
            {sub.in_free ? <b style={{ color: "var(--green)" }}>darmowa do {sub.promo_until} ({sub.days_left} dni)</b> : <b style={{ color: "var(--gold)" }}>{Number(sub.annual_fee ?? 299).toFixed(0)} zł/rok</b>}
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
          <input className={inp} style={inpStyle} type="number" min={0} step="0.01" placeholder="Cena brutto (zł)" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} required />
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
        <p className="text-xs" style={{ color: "var(--mut)" }}>Kategoria: {chosen?.name ?? "—"}. Prowizja 7,9% liczona od ceny brutto — na portfel Sunrise Pay trafia 92,1% ceny brutto.{price > 0 && <> Przy cenie {zl(price)} otrzymasz <b>{zl(price * 0.921)}</b>.</>}</p>
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
  const [labelFor, setLabelFor] = useState<string | null>(null);
  if (loading) return <p style={{ color: "var(--mut)" }}>Ładowanie…</p>;
  return (
    <div className="flex flex-col gap-3">
      {msg && <div className="rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>{msg}</div>}
      {sorders.map((o) => (
        <Card key={o.order_id}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: "var(--mut)" }}>{dt(o.created_at)} · {({ paid: "Opłacone", shipped: "Wysłane", delivered: "Dostarczone", completed: "Zakończone" } as any)[o.status] ?? o.status}{o.tracking_no ? ` · ${o.tracking_no}` : ""}</span>
            {o.status === "paid" ? (
              <span className="flex items-center gap-2">
                <button onClick={() => setLabelFor(o.order_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>📦 Kup etykietę</button>
                <button onClick={() => onShip(o.order_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Oznacz wysłane</button>
              </span>
            ) : <span className="text-xs" style={{ color: "var(--green)" }}>✓</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            {(o.items ?? []).map((it: any, i: number) => <div key={i} className="flex justify-between text-sm"><span>{it.title} × {it.qty}</span><span style={{ color: "var(--mut)" }}>{zl(it.payout)}</span></div>)}
          </div>
          <div className="text-right text-sm mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>Twoja wypłata (92,1% brutto): <b style={{ color: "var(--green)" }}>{zl(o.my_total)}</b></div>
        </Card>
      ))}
      {sorders.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień.</p>}
    {labelFor && <LabelDialog orderId={labelFor} onClose={() => { setLabelFor(null); load(); }} />}
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
            <a href="https://mysunrise.pl/wallet/wyplata" target="_blank" rel="noreferrer"
              className="text-sm rounded-lg px-4 py-2 font-semibold text-black w-full text-center" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>Wypłać na konto →</a>
          </div>
        </div>
        <div className="text-xs mt-3" style={{ color: "var(--mut)" }}>{w.available ? "Wpływy ze sprzedaży trafiają tu w walucie zapłaty kupującego (Sunrise Pay lub Gold). Wypłatę na konto realizuje MySunrise." : "Po sprzedaży dostajesz 92,1% ceny brutto na portfel (prowizja 7,9% liczona od brutto). Wypłatę na konto zlecasz w MySunrise — minimum 50 zł, standardowo bez opłat, przelew do 1 dnia roboczego."}</div>
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


// ── STATYSTYKI ──────────────────────────────────────────────────────
function Statystyki() {
  const [s, setS] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  useEffect(() => {
    sellerSummary().then(setS).catch(() => {});
    import("../lib/api").then((a) => a.catalogStats({ provider: "mysunrise", sort: "views", limit: 10 }).then(setTop).catch(() => {}));
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Wpływy ze sprzedaży (92,1% brutto)" value={zl(s?.sales_net ?? 0)} color="var(--green)" />
        <Kpi label="Zamówienia łącznie" value={String(s?.orders_total ?? 0)} />
        <Kpi label="Aktywne oferty" value={String(s?.offers_count ?? 0)} />
        <Kpi label="Do wysłania" value={String(s?.orders_to_ship ?? 0)} color="var(--gold)" />
      </div>
      <Card>
        <div className="font-semibold mb-3">🔥 Najczęściej oglądane oferty</div>
        {top.length === 0 ? <p className="text-sm" style={{ color: "var(--mut)" }}>Statystyki wyświetleń pojawią się, gdy klienci zaczną oglądać Twoje oferty.</p> : (
          <div className="flex flex-col">
            {top.map((o: any, i: number) => (
              <div key={o.offer_id || i} className="flex items-center gap-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="w-6 font-bold" style={{ color: "var(--mut)" }}>{i + 1}.</span>
                <span className="flex-1 truncate">{o.title}</span>
                <span style={{ color: "var(--mut)" }}>{o.views ?? 0} 👁</span>
                <span className="font-semibold" style={{ color: "var(--gold)" }}>{o.orders ?? 0} zam.</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <div className="font-semibold mb-2">💡 Jak sprzedawać więcej</div>
        <ul className="text-sm flex flex-col gap-1.5" style={{ color: "var(--mut)" }}>
          <li>• Wyróżnij ofertę w zakładce <b style={{ color: "var(--ink)" }}>Promowanie</b> — trafi na stronę główną i wyżej w wynikach.</li>
          <li>• Dodaj zdjęcie dobrej jakości i opis wygenerowany przez AI (przycisk w formularzu oferty).</li>
          <li>• Utrzymuj stan magazynowy — oferty „0 szt." znikają z wyników.</li>
        </ul>
      </Card>
    </div>
  );
}

// ── WYSYŁKA ─────────────────────────────────────────────────────────
function Wysylka() {
  const [lanes, setLanes] = useState<any[]>([]);
  useEffect(() => { import("../lib/api").then((a) => a.listShippingLanes().then((x: any) => setLanes(x || [])).catch(() => {})); }, []);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="font-semibold mb-2">🚚 Metody dostawy na Twoich ofertach</div>
        {lanes.length === 0 ? <p className="text-sm" style={{ color: "var(--mut)" }}>Ładowanie metod dostawy…</p> : (
          <div className="flex flex-col">
            {lanes.map((l: any) => (
              <div key={l.code || l.id} className="flex items-center gap-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="flex-1">{l.name || l.label || l.code}</span>
                <span className="font-semibold" style={{ color: "var(--gold)" }}>{zl(l.price ?? l.price_gross ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs mt-3" style={{ color: "var(--mut)" }}>Kupujący wybiera metodę i płaci za dostawę w koszyku — kwota dostawy trafia do Ciebie razem z wypłatą.</p>
      </Card>
      <GlobKurierCard />
    </div>
  );
}



// ── KUP ETYKIETĘ (GlobKurier) ───────────────────────────────────────
function LabelDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const LS = "gk_sender";
  const [par, setPar] = useState({ length: "30", width: "20", height: "10", weight: "1" });
  const [snd, setSnd] = useState<any>(() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } });
  const [opts, setOpts] = useState<any[] | null>(null);
  const [recv, setRecv] = useState<any>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);
  const inp = "w-full rounded-lg px-3 py-2 outline-none text-sm";
  const inpStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as React.CSSProperties;

  async function loadOptions() {
    setBusy(true); setErr(null); setOpts(null);
    try {
      const { data } = await supabase.functions.invoke("globkurier", { body: { action: "label-options", order_id: orderId, parcel: par, sender_postcode: snd.postCode || "" } });
      if (!data?.ok) throw new Error(data?.error || "Błąd wyceny");
      setOpts(data.options || []); setRecv(data.receiver || null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function buy() {
    if (!sel) { setErr("Wybierz przewoźnika."); return; }
    for (const k of ["name", "street", "city", "postCode", "phone", "email"]) if (!snd[k]) { setErr("Uzupełnij dane nadawcy (wszystkie pola)."); return; }
    setBusy(true); setErr(null);
    try {
      localStorage.setItem(LS, JSON.stringify(snd));
      const { data, error } = await supabase.functions.invoke("globkurier", { body: { action: "buy-label", order_id: orderId, product_id: sel, parcel: par, sender: snd } });
      if (error) {
        let msg = error.message;
        try { const j = await (error as any).context?.json?.(); if (j?.message || j?.error) msg = j.message || j.error; } catch { /* zostaw */ }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.message || data?.error || "Błąd zakupu etykiety");
      setDone(data);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const set = (k: string, v: string) => setSnd((s: any) => ({ ...s, [k]: v }));
  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadLabel() {
    if (!done?.number) return;
    setPdfBusy(true); setErr(null);
    try {
      const { data } = await supabase.functions.invoke("globkurier", { body: { action: "label", number: done.number } });
      if (data?.pdf_base64) {
        const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const a = document.createElement("a"); a.href = url; a.download = `etykieta-${done.number}.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else if (data?.urls?.length) {
        window.open(data.urls[0], "_blank");
      } else {
        setErr(data?.note || "Etykieta jeszcze niedostępna — spróbuj za chwilę.");
      }
    } catch (e) { setErr((e as Error).message); } finally { setPdfBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => !busy && onClose()}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-auto" style={{ background: "var(--bg, #0E1729)", border: "1px solid var(--line)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-lg">📦 Kup etykietę — GlobKurier</div>
          <button onClick={onClose} className="text-xl" style={{ color: "var(--mut)" }}>✕</button>
        </div>
        {done ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl p-4" style={{ background: "rgba(122,184,154,.14)", border: "1px solid rgba(122,184,154,.4)" }}>
              <div className="font-semibold" style={{ color: "var(--green)" }}>✅ Przesyłka utworzona</div>
              <div className="text-sm mt-1">Numer: <b>{done.number || "—"}</b> · koszt: <b>{done.price_for_seller} zł</b></div>
              <div className="text-xs mt-1" style={{ color: "var(--mut)" }}>{done.paid_from_wallet ? <>Opłacono z Twojego portfela Sunrise Pay{typeof done.balance === "number" ? <> · saldo: <b>{done.balance.toFixed(2)} zł</b></> : null}.</> : null} Numer śledzenia zapisany przy zamówieniu — kupujący już go widzi.</div>
            </div>
            <button onClick={downloadLabel} disabled={pdfBusy} className="rounded-xl py-2 font-semibold disabled:opacity-50" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>{pdfBusy ? "Pobieram…" : "🖨️ Pobierz etykietę (PDF)"}</button>
            {err && <div className="text-sm" style={{ color: "#ff7b7b" }}>{err}</div>}
            <button onClick={onClose} className="rounded-xl py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Zamknij</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold" style={{ color: "var(--mut)" }}>WYMIARY PACZKI (cm) I WAGA (kg)</div>
            <div className="grid grid-cols-4 gap-2">
              {(["length", "width", "height", "weight"] as const).map((k, i) => (
                <input key={k} className={inp} style={inpStyle} placeholder={["Dł.", "Szer.", "Wys.", "Waga"][i]} value={(par as any)[k]} onChange={(e) => setPar((p) => ({ ...p, [k]: e.target.value }))} />
              ))}
            </div>
            <button onClick={loadOptions} disabled={busy} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>{busy && !opts ? "Wyceniam…" : "Pokaż przewoźników i ceny"}</button>
            {recv && <div className="text-xs" style={{ color: "var(--mut)" }}>Odbiorca: {recv.name} · {recv.street}, {recv.postal} {recv.city}</div>}
            {opts && (
              <div className="flex flex-col gap-1 max-h-52 overflow-auto">
                {opts.length === 0 && <div className="text-sm" style={{ color: "var(--mut)" }}>Brak ofert dla tych wymiarów.</div>}
                {opts.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer" style={{ background: sel === o.id ? "rgba(122,184,154,.15)" : "var(--glass)", border: `1px solid ${sel === o.id ? "rgba(122,184,154,.5)" : "var(--line)"}` }}>
                    <input type="radio" name="gkopt" checked={sel === o.id} onChange={() => setSel(o.id)} />
                    <span className="flex-1 text-sm">{o.name}</span>
                    <span className="text-xs" style={{ color: "var(--mut)" }}>{o.delivery_days ? `~${o.delivery_days} dn.` : ""}</span>
                    <span className="font-semibold" style={{ color: "var(--gold)" }}>{o.price_for_seller} zł</span>
                  </label>
                ))}
              </div>
            )}
            {opts && opts.length > 0 && (
              <>
                <div className="text-xs font-semibold mt-1" style={{ color: "var(--mut)" }}>DANE NADAWCY (zapamiętamy)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inp} style={inpStyle} placeholder="Nazwa / imię i nazwisko" value={snd.name || ""} onChange={(e) => set("name", e.target.value)} />
                  <input className={inp} style={inpStyle} placeholder="Ulica i numer" value={snd.street || ""} onChange={(e) => set("street", e.target.value)} />
                  <input className={inp} style={inpStyle} placeholder="Miasto" value={snd.city || ""} onChange={(e) => set("city", e.target.value)} />
                  <input className={inp} style={inpStyle} placeholder="Kod pocztowy" value={snd.postCode || ""} onChange={(e) => set("postCode", e.target.value)} />
                  <input className={inp} style={inpStyle} placeholder="Telefon" value={snd.phone || ""} onChange={(e) => set("phone", e.target.value)} />
                  <input className={inp} style={inpStyle} placeholder="E-mail" value={snd.email || ""} onChange={(e) => set("email", e.target.value)} />
                </div>
                <button onClick={buy} disabled={busy} className="rounded-xl py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Kupuję…" : "Kup etykietę (płatność z portfela Sunrise Pay)"}</button>
                <div className="text-xs" style={{ color: "var(--mut)" }}>Koszt etykiety zostanie pobrany z Twojego portfela Sunrise Pay — tego samego, na który trafiają wpływy ze sprzedaży.</div>
              </>
            )}
            {err && <div className="text-sm" style={{ color: "#ff7b7b" }}>{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function GlobKurierCard() {
  const [st, setSt] = useState<{ configured?: boolean; env?: string } | null>(null);
  useEffect(() => {
    supabase.functions.invoke("globkurier", { body: { action: "status" } })
      .then(({ data }) => setSt(data || {})).catch(() => setSt({}));
  }, []);
  return (
    <Card>
      <div className="font-semibold mb-1">📦 Etykiety kurierskie — GlobKurier {st?.configured ? (st?.env === "prod" ? "✅ aktywne" : "🧪 tryb testowy") : "⏳ w przygotowaniu"}</div>
      <p className="text-sm" style={{ color: "var(--mut)" }}>
        Integracja z GlobKurier (InPost, DPD, DHL, GLS, UPS — krajowe i międzynarodowe): kupisz etykietę jednym
        klikiem prosto z zamówienia, w stawkach hurtowych Sunrise, a tracking automatycznie zobaczy kupujący.
        Zero własnych umów z kurierami.
      </p>
      {!st?.configured && <p className="text-xs mt-2" style={{ color: "var(--gold)" }}>Start po podpięciu konta GlobKurier przez operatora platformy.</p>}
    </Card>
  );
}

function Shell({ children, tabs }: { children: React.ReactNode; tabs?: { tab: Tab; setTab: (t: Tab) => void } }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div className="flex-1" />
          <a href="/konto" onClick={() => setMode("buyer")} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606" }}>👤 Moje konto</a>
          <a href="/" onClick={() => setMode("buyer")} className="text-sm navlink">🛍️ Sklep</a>
        </div>
        {tabs && (
          <div className="mx-auto max-w-7xl px-4 pb-2 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => tabs.setTab(t.id)} className="shrink-0 text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={tabs.tab === t.id ? { background: "linear-gradient(135deg,#7AB89A,#38E0F0)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>{t.label}</button>
            ))}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
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
      <StatystykiBanerow />
    </div>
  );
}

// Wyniki kampanii banerowych sprzedawcy: co kupil, ile go to kosztowalo i co dostal w zamian.
function StatystykiBanerow() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { myBannerStats().then((d) => setRows(d ?? [])).catch(() => {}).finally(() => setLoaded(true)); }, []);
  if (!loaded) return null;
  return (
    <Card>
      <div className="font-semibold mb-1">📊 Twoje bannery — wyniki</div>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--mut)" }}>
          Nie masz jeszcze wykupionych banerów. Odsłony i kliknięcia liczymy od momentu startu kampanii —
          baner rozliczany jest ryczałtem za dzień, więc statystyki niczego nie kosztują.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--mut)" }} className="text-left text-xs">
                <th className="py-2 pr-3">Miejsce</th>
                <th className="py-2 pr-3">Termin</th>
                <th className="py-2 pr-3 text-right">Zapłacono</th>
                <th className="py-2 pr-3 text-right">Odsłony</th>
                <th className="py-2 pr-3 text-right">Kliknięcia</th>
                <th className="py-2 text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-2 pr-3">
                    {r.slot_name}
                    {r.trwa
                      ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(80,200,120,.15)", color: "#6ee7a0" }}>trwa</span>
                      : <span className="ml-2 text-[10px]" style={{ color: "var(--mut)" }}>zakończona</span>}
                    {r.headline ? <div className="text-[11px]" style={{ color: "var(--mut)" }}>{r.headline}</div> : null}
                  </td>
                  <td className="py-2 pr-3 text-xs" style={{ color: "var(--mut)" }}>{r.starts_on} → {r.ends_on}</td>
                  <td className="py-2 pr-3 text-right">{zl(r.amount_paid)}</td>
                  <td className="py-2 pr-3 text-right">{Number(r.impressions).toLocaleString("pl-PL")}</td>
                  <td className="py-2 pr-3 text-right">{Number(r.clicks).toLocaleString("pl-PL")}</td>
                  <td className="py-2 text-right" style={{ color: "var(--gold)" }}>{Number(r.ctr).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
