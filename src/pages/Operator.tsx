import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  amiOperator, adminOverview, adminOrders, adminOrderItems, adminSetOrderStatus,
  adminCustomers, adminSellers, adminSetSellerStatus,
  listReturns, resolveReturn, listPendingSellers, reviewSeller, listOffersAdmin, moderateOffer,
  bridgeQueue, retryBridgeOrder, getAutoForward, setAutoForward, approveBridgeForward, rejectBridgeForward,
  cjImport, cjDrafts, cjSetStatus, cjActivateAll, cjStats, type CjDraft, type CjStat,
} from "../lib/api";

const zl = (v: number) => Math.round(Number(v || 0)).toLocaleString("pl-PL") + " zł";
const n = (v: number) => Number(v || 0).toLocaleString("pl-PL");
const dt = (s: string) => new Date(s).toLocaleString("pl-PL");

type Tab = "pulpit" | "zamowienia" | "klienci" | "sprzedawcy" | "oferty" | "cjdrop" | "fulfillment" | "zwroty";
const TABS: { id: Tab; label: string }[] = [
  { id: "pulpit", label: "📊 Pulpit" },
  { id: "zamowienia", label: "🧾 Zamówienia" },
  { id: "klienci", label: "👤 Klienci" },
  { id: "sprzedawcy", label: "🏪 Sprzedawcy" },
  { id: "oferty", label: "📦 Oferty" },
  { id: "cjdrop", label: "🛒 CJ Drop" },
  { id: "fulfillment", label: "🚚 Fulfillment" },
  { id: "zwroty", label: "↩️ Zwroty" },
];

const ORDER_STATUSES = ["paid", "shipped", "delivered", "completed", "cancelled", "disputed"];
const statusLabel: Record<string, string> = {
  created: "Utworzone", paid: "Opłacone", shipped: "Wysłane", delivered: "Dostarczone",
  completed: "Zakończone", cancelled: "Anulowane", disputed: "Spór",
};

export default function Operator() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isOp, setIsOp] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pulpit");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      setIsOp(await amiOperator());
    });
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>Back-office</span>
          <div className="flex-1" />
          <a href="/" className="text-sm text-zinc-300 hover:text-white">🛍️ Zakupy jako klient</a>
        </div>
        {isOp && (
          <div className="mx-auto max-w-6xl px-4 pb-2 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                      className="shrink-0 text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={tab === t.id ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}
        {authed && isOp === false && (
          <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid rgba(242,92,176,.4)" }}>
            <div className="text-xl font-display font-semibold mb-1" style={{ color: "#F8A8D2" }}>Brak uprawnień</div>
            <p className="text-sm" style={{ color: "var(--mut)" }}>To konto nie ma roli operatora. <a href="/" className="text-amber-400 underline">Wróć do sklepu</a>.</p>
          </div>
        )}
        {isOp && tab === "pulpit" && <Pulpit />}
        {isOp && tab === "zamowienia" && <Zamowienia />}
        {isOp && tab === "klienci" && <Klienci />}
        {isOp && tab === "sprzedawcy" && <Sprzedawcy />}
        {isOp && tab === "oferty" && <Oferty />}
        {isOp && tab === "cjdrop" && <CjDrop />}
        {isOp && tab === "fulfillment" && <Fulfillment />}
        {isOp && tab === "zwroty" && <Zwroty />}
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-4 ${className}`} style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</div>;
}
function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--mut)" }}>{label}</div>
      <div className="font-display text-2xl font-semibold" style={{ color: color ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}
const inp = "rounded-lg px-3 py-2 text-sm outline-none";
const inpStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as React.CSSProperties;

// ── PULPIT ──────────────────────────────────────────────────────────
function Pulpit() {
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { adminOverview().then(setO).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-rose-400">Błąd: {err}</p>;
  if (!o) return <p style={{ color: "var(--mut)" }}>Ładowanie…</p>;
  return (
    <>
      <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, rgba(242,115,29,.14), rgba(124,58,237,.12))", border: "1px solid rgba(242,115,29,.3)" }}>
        <div className="text-sm" style={{ color: "var(--mut)" }}>Zysk firmy (prowizja 4,9% po cashbacku)</div>
        <div className="font-display text-4xl font-bold" style={{ color: "var(--gold)" }}>{zl(o.company)}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="GMV (obrót opłacony)" value={zl(o.gmv)} />
        <Kpi label="Prowizja łączna 7,9%" value={zl(o.commission_total)} color="var(--green)" />
        <Kpi label="Cashback 3% (do klientów)" value={zl(o.cashback)} />
        <Kpi label="Wypłaty sprzedawców 92,1%" value={zl(o.seller_payouts)} />
        <Kpi label="Zamówienia (opłacone/łącznie)" value={`${n(o.orders_paid)} / ${n(o.orders)}`} />
        <Kpi label="Klienci" value={n(o.buyers)} />
        <Kpi label="Sprzedawcy aktywni" value={n(o.sellers_active)} />
        <Kpi label="Sprzedawcy do KYC" value={n(o.sellers_pending)} color={o.sellers_pending ? "var(--gold)" : undefined} />
        <Kpi label="Oferty aktywne" value={n(o.offers_active)} />
        <Kpi label="Zwroty otwarte" value={n(o.returns_open)} color={o.returns_open ? "#F25CB0" : undefined} />
      </div>
    </>
  );
}

// ── ZAMÓWIENIA ──────────────────────────────────────────────────────
function Zamowienia() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() { setLoading(true); try { setRows(await adminOrders(status || undefined, q || undefined)); } finally { setLoading(false); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setItems(await adminOrderItems(id));
  }
  async function setStat(id: string, s: string) { await adminSetOrderStatus(id, s); await load(); }

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Szukaj: e-mail / nr / odbiorca" className={inp} style={{ ...inpStyle, minWidth: 220 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp} style={inpStyle}>
          <option value="">Wszystkie statusy</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <button onClick={load} className="px-4 py-2 rounded-lg text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Szukaj</button>
        <span className="ml-auto text-sm" style={{ color: "var(--mut)" }}>{rows.length} zamówień</span>
      </div>
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card key={r.order_id}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => toggle(r.order_id)} className="text-left min-w-0 flex-1">
                <div className="text-sm font-medium">{r.buyer_email ?? "—"} · {zl(r.total_gross)} <span style={{ color: "var(--mut)" }}>· {r.items_count} poz.{r.ship_city ? ` · ${r.ship_city}` : ""}</span></div>
                <div className="text-xs" style={{ color: "var(--mut)" }}>{dt(r.created_at)} · nr {String(r.order_id).slice(0, 8)}{r.tracking_no ? ` · 📦 ${r.tracking_no}` : ""}</div>
              </button>
              <select value={r.status} onChange={(e) => setStat(r.order_id, e.target.value)} className={inp} style={inpStyle}>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
              </select>
            </div>
            {open === r.order_id && (
              <div className="mt-3 pt-3 flex flex-col gap-1" style={{ borderTop: "1px solid var(--line)" }}>
                {items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{it.title} × {it.qty} <span style={{ color: "var(--mut)" }}>({it.seller ?? "—"})</span></span>
                    <span style={{ color: "var(--mut)" }}>{zl(it.unit_price_gross * it.qty)} · netto {zl(it.seller_payout)}</span>
                  </div>
                ))}
                {items.length === 0 && <span className="text-sm" style={{ color: "var(--mut)" }}>Brak pozycji.</span>}
              </div>
            )}
          </Card>
        ))}
        {!loading && rows.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień.</p>}
      </div>
    </>
  );
}

// ── KLIENCI ─────────────────────────────────────────────────────────
function Klienci() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows(await adminCustomers(q || undefined)); } finally { setLoading(false); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <div className="flex gap-2 mb-4 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Szukaj: e-mail / nazwa" className={inp} style={{ ...inpStyle, minWidth: 220 }} />
        <button onClick={load} className="px-4 py-2 rounded-lg text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Szukaj</button>
        <span className="ml-auto text-sm" style={{ color: "var(--mut)" }}>{rows.length} klientów</span>
      </div>
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card key={r.buyer_id}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.email} {r.display_name ? <span style={{ color: "var(--mut)" }}>· {r.display_name}</span> : null}</div>
                <div className="text-xs" style={{ color: "var(--mut)" }}>od {dt(r.created_at)} · {r.orders_count} zamówień · wydane {zl(r.spent)}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: r.linked ? "var(--green)" : "var(--mut)" }}>
                {r.linked ? "portfel MySunrise ✓" : "portfel niepołączony"}
              </span>
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && <p style={{ color: "var(--mut)" }}>Brak klientów.</p>}
      </div>
    </>
  );
}

// ── SPRZEDAWCY ──────────────────────────────────────────────────────
function Sprzedawcy() {
  const [rows, setRows] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try { setRows(await adminSellers(q || undefined)); setPending(await listPendingSellers().catch(() => [])); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function onKyc(id: string, ok: boolean) { await reviewSeller(id, ok); await load(); }
  async function onStatus(id: string, s: string) { await adminSetSellerStatus(id, s); await load(); }

  return (
    <>
      {pending.length > 0 && (
        <Card className="mb-4">
          <div className="font-semibold mb-2">Do weryfikacji KYC ({pending.length})</div>
          <div className="flex flex-col gap-2">
            {pending.map((s) => (
              <div key={s.seller_id} className="flex items-center justify-between gap-3">
                <div className="text-sm min-w-0"><b>{s.legal_name}</b> <span style={{ color: "var(--mut)" }}>· {s.email}{s.nip ? ` · NIP ${s.nip}` : ""}</span></div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onKyc(s.seller_id, true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Zatwierdź</button>
                  <button onClick={() => onKyc(s.seller_id, false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex gap-2 mb-4 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Szukaj: nazwa / e-mail / NIP" className={inp} style={{ ...inpStyle, minWidth: 220 }} />
        <button onClick={load} className="px-4 py-2 rounded-lg text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Szukaj</button>
        <span className="ml-auto text-sm" style={{ color: "var(--mut)" }}>{rows.length} sprzedawców</span>
      </div>
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card key={r.seller_id}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.legal_name} <span style={{ color: "var(--mut)" }}>· {r.email}</span></div>
                <div className="text-xs" style={{ color: "var(--mut)" }}>
                  {r.seller_type === "sunrise" ? "Sunrise (nasz)" : "partner"} · {r.offers_count} ofert · sprzedaż netto {zl(r.sales_net)}
                  {r.is_pay_partner && r.free_until ? ` · free do ${r.free_until}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: r.status === "active" ? "var(--green)" : r.status === "suspended" ? "#F25CB0" : "var(--gold)" }}>{r.status}</span>
                {r.status === "active"
                  ? <button onClick={() => onStatus(r.seller_id, "suspended")} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "rgba(242,92,176,.14)", border: "1px solid rgba(242,92,176,.4)", color: "#F8A8D2" }}>Zawieś</button>
                  : <button onClick={() => onStatus(r.seller_id, "active")} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Aktywuj</button>}
              </div>
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && <p style={{ color: "var(--mut)" }}>Brak sprzedawców.</p>}
      </div>
    </>
  );
}

// ── OFERTY (moderacja) ──────────────────────────────────────────────
function Oferty() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows((await listOffersAdmin()) as any[]); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function onMod(id: string, hide: boolean) { await moderateOffer(id, hide); await load(); }
  return (
    <>
      <div className="mb-4 text-sm" style={{ color: "var(--mut)" }}>{rows.length} ofert (moderacja)</div>
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      <div className="flex flex-col gap-2">
        {rows.map((o) => (
          <Card key={o.offer_id} className={o.status === "hidden" ? "opacity-60" : ""}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <a href={`/produkt/${o.offer_id}`} className="text-sm font-medium hover:text-amber-300">{o.title}</a>
                <div className="text-xs" style={{ color: "var(--mut)" }}>{o.seller} · {zl(o.price_gross)} · {o.status === "hidden" ? "ukryta" : "aktywna"}</div>
              </div>
              {o.status === "hidden"
                ? <button onClick={() => onMod(o.offer_id, false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black shrink-0" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Przywróć</button>
                : <button onClick={() => onMod(o.offer_id, true)} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(242,92,176,.14)", border: "1px solid rgba(242,92,176,.4)", color: "#F8A8D2" }}>Ukryj</button>}
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert.</p>}
      </div>
    </>
  );
}

// ── CJ DROPSHIPPING (import + akceptacja draftów + statystyki) ───────
function CjDrop() {
  const [view, setView] = useState<"drafty" | "statystyki">("drafty");
  const [drafts, setDrafts] = useState<CjDraft[]>([]);
  const [stats, setStats] = useState<CjStat[]>([]);
  const [sort, setSort] = useState<"sold" | "views" | "margin" | "marginPct" | "price">("sold");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState("20");
  const [keyword, setKeyword] = useState("");

  async function load() { setLoading(true); try { setDrafts(await cjDrafts()); } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); } }
  async function loadStats() { setLoading(true); try { setStats(await cjStats()); } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (view === "statystyki") loadStats(); }, [view]);

  const sortedStats = [...stats].sort((a, b) => {
    if (sort === "sold") return b.sold - a.sold;
    if (sort === "views") return b.views - a.views;
    if (sort === "marginPct") return b.margin_pct - a.margin_pct;
    if (sort === "price") return b.price_gross - a.price_gross;
    return b.margin_zl - a.margin_zl;
  });

  async function onImport() {
    setBusy(true); setMsg(null);
    try {
      const r: any = await cjImport({ pageSize: Math.min(Number(pageSize) || 20, 50), categoryKeyword: keyword || undefined });
      if (r?.available === false) setMsg(r.error ?? "Brak/nieprawidłowy klucz CJ (ustaw sekret CJ_API_KEY).");
      else setMsg(`Zaimportowano ${r?.imported ?? 0} nowych (str. ${r?.page}), zaktualizowano ${r?.updated ?? 0}. Wszystko jako draft.`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function onSet(id: string, status: "active" | "blocked") { try { await cjSetStatus(id, status); setDrafts((d) => d.filter((x) => x.id !== id)); } catch (e) { alert((e as Error).message); } }
  async function onActivateAll() {
    if (!window.confirm(`Aktywować wszystkie ${drafts.length} draftów CJ? Trafią do sklepu jako aktywne oferty.`)) return;
    setBusy(true);
    try { const cnt = await cjActivateAll(); setMsg(`Aktywowano ${cnt} ofert.`); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Card className="mb-4">
        <div className="font-semibold mb-1">Import z CJ Dropshipping</div>
        <p className="text-xs mb-3" style={{ color: "var(--mut)" }}>Pobiera produkty CJ jako <b>drafty</b> (Sunrise first-party, cashback-only). Cena = cena CJ × kurs × marża (konfiguracja w platform_config). Nic nie trafia do sklepu bez akceptacji poniżej.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Słowo klucz (opcjonalnie, np. lamp)" className={inp} style={{ ...inpStyle, minWidth: 240 }} />
          <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} type="number" min={1} max={50} className={inp} style={{ ...inpStyle, width: 90 }} />
          <span className="text-xs" style={{ color: "var(--mut)" }}>szt./import (max 50)</span>
          <button onClick={onImport} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>{busy ? "Importuję…" : "Importuj z CJ →"}</button>
        </div>
        {msg && <div className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>{msg}</div>}
      </Card>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setView("drafty")} className="text-sm px-4 py-2 rounded-xl font-semibold" style={view === "drafty" ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>Drafty ({drafts.length})</button>
        <button onClick={() => setView("statystyki")} className="text-sm px-4 py-2 rounded-xl font-semibold" style={view === "statystyki" ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>📊 Statystyki</button>
      </div>

      {view === "drafty" && (
        <>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="font-semibold">Drafty do akceptacji <span style={{ color: "var(--mut)" }}>({drafts.length})</span></div>
            {drafts.length > 0 && <button onClick={onActivateAll} disabled={busy} className="text-sm px-4 py-2 rounded-xl font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Aktywuj wszystkie</button>}
          </div>
          {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
            {drafts.map((o) => (
              <Card key={o.id}>
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg shrink-0" style={{ background: o.image_url ? `center/cover no-repeat url(${o.image_url})` : "var(--glass)", border: "1px solid var(--line)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{o.title}</div>
                    <div className="text-sm mt-1" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => onSet(o.id, "active")} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Aktywuj</button>
                  <button onClick={() => onSet(o.id, "blocked")} className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(242,92,176,.14)", border: "1px solid rgba(242,92,176,.4)", color: "#F8A8D2" }}>Odrzuć</button>
                </div>
              </Card>
            ))}
            {!loading && drafts.length === 0 && <p style={{ color: "var(--mut)" }}>Brak draftów. Zaimportuj z CJ powyżej.</p>}
          </div>
        </>
      )}

      {view === "statystyki" && (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-semibold">Statystyki produktów CJ</span>
            <span className="text-xs" style={{ color: "var(--mut)" }}>· sortuj:</span>
            {(([["sold", "🛒 sprzedaż"], ["views", "👁 wyświetlenia"], ["margin", "💰 marża zł"], ["marginPct", "% marży"], ["price", "cena"]]) as [typeof sort, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className="text-xs px-3 py-1.5 rounded-full" style={sort === k ? { background: "rgba(242,115,29,.16)", border: "1px solid rgba(242,115,29,.5)", color: "var(--gold)" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>{l}</button>
            ))}
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--mut)" }}>Marża brutto = cena − koszt CJ (bez wysyłki). Ujemna (różowe) = tracisz. Gdzie jest ruch (👁) + marża, tam pompuj kasę.</p>
          {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--mut)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Produkt</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Cena</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Koszt</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Marża</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>%</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>👁</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>🛒</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Przychód</th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)", background: r.margin_zl <= 0 ? "rgba(242,92,176,.08)" : undefined }}>
                    <td style={{ padding: "8px 12px", maxWidth: 340 }}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded shrink-0" style={{ background: r.image_url ? `center/cover no-repeat url(${r.image_url})` : "var(--glass)", border: "1px solid var(--line)" }} />
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{zl(r.price_gross)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--mut)" }}>{zl(r.cost_zl)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: r.margin_zl <= 0 ? "#F8A8D2" : "var(--green)" }}>{zl(r.margin_zl)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: r.margin_pct <= 0 ? "#F8A8D2" : "var(--mut)" }}>{Math.round(r.margin_pct)}%</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.views}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: r.sold > 0 ? 700 : 400, color: r.sold > 0 ? "var(--gold)" : "var(--mut)" }}>{r.sold}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{zl(r.revenue)}</td>
                  </tr>
                ))}
                {!loading && sortedStats.length === 0 && <tr><td colSpan={8} style={{ padding: "12px", color: "var(--mut)" }}>Brak danych. Zaimportuj i aktywuj produkty CJ.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ── FULFILLMENT (dropship + auto-przekaz) ───────────────────────────
function Fulfillment() {
  const [bridge, setBridge] = useState<any[]>([]);
  const [autoFwd, setAutoFwd] = useState(false);
  const [fwdBusy, setFwdBusy] = useState(false);
  async function load() { setBridge(await bridgeQueue().catch(() => [])); setAutoFwd(await getAutoForward().catch(() => false)); }
  useEffect(() => { load(); }, []);
  async function onToggle() {
    const next = !autoFwd;
    if (next && !window.confirm("Włączyć AUTOMATYCZNY przekaz zamówień dropship do TeemDrop?\n\nUWAGA: każde opłacone zamówienie dropship będzie automatycznie kupowane u dostawcy (realny wydatek).")) return;
    setFwdBusy(true);
    try { setAutoFwd(await setAutoForward(next)); await load(); } catch (e) { alert((e as Error).message); } finally { setFwdBusy(false); }
  }
  async function onApprove(id: string) { if (!window.confirm("Przekazać do TeemDrop? Zakup u dostawcy (realny wydatek).")) return; try { await approveBridgeForward(id); await load(); } catch (e) { alert((e as Error).message); } }
  async function onReject(id: string) { if (!window.confirm("Odrzucić przekazanie?")) return; try { await rejectBridgeForward(id); await load(); } catch (e) { alert((e as Error).message); } }
  async function onRetry(id: string) { try { await retryBridgeOrder(id); await load(); } catch (e) { alert((e as Error).message); } }

  const color: Record<string, string> = { awaiting_approval: "#F2A93B", pending: "var(--gold)", pushed: "#38E0F0", processing: "#38E0F0", shipped: "#34E3A0", delivered: "#34E3A0", error: "#F25CB0", cancelled: "var(--mut)" };
  const lbl: Record<string, string> = { awaiting_approval: "do zatwierdzenia", pending: "w kolejce", pushed: "przekazane", processing: "realizacja", shipped: "wysłane", delivered: "dostarczone", error: "błąd", cancelled: "odrzucone" };
  const awaiting = bridge.filter((b) => b.status === "awaiting_approval").length;

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="font-semibold">Kolejka dropship (TeemDrop){awaiting > 0 && <span className="ml-2 text-sm px-2.5 py-1 rounded-full" style={{ background: "rgba(242,169,59,.16)", color: "#F2A93B" }}>{awaiting} do zatwierdzenia</span>}</div>
        <button onClick={onToggle} disabled={fwdBusy} className="text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-50" style={{ background: autoFwd ? "linear-gradient(135deg,#34E3A0,#38E0F0)" : "var(--glass)", border: "1px solid var(--line)", color: autoFwd ? "#000" : "var(--ink)" }}>Auto-przekaz: {autoFwd ? "WŁĄCZONY ✅" : "wyłączony"}</button>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--mut)" }}>{autoFwd ? "Automat WŁĄCZONY: opłacone dropshipy kupowane u dostawcy bez pytania." : "Automat wyłączony (bezpiecznie): dropship czeka na ręczne „Przekaż”. Nic nie kupujemy bez zatwierdzenia."}</p>
      <div className="flex flex-col gap-2">
        {bridge.map((b) => (
          <Card key={b.bridge_id} className={b.status === "awaiting_approval" ? "ring-1" : ""}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">Zam. {String(b.order_id).slice(0, 8)}{b.total_gross != null ? ` · ${zl(b.total_gross)}` : ""}{b.dropship_items != null ? ` · ${b.dropship_items} poz.` : ""}{b.woo_order_id ? ` · Woo #${b.woo_order_id}` : ""}{b.tracking_number ? ` · 📦 ${b.tracking_number}` : ""}</div>
                <div className="text-xs" style={{ color: "var(--mut)" }}>{b.buyer_email}{b.ship_city ? ` · ${b.ship_city}` : ""}</div>
                {b.last_error && <div className="text-xs" style={{ color: "#F8A8D2" }}>{b.last_error}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: color[b.status] ?? "var(--ink)" }}>{lbl[b.status] ?? b.status}</span>
                {b.status === "awaiting_approval" && <>
                  <button onClick={() => onApprove(b.bridge_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Przekaż →</button>
                  <button onClick={() => onReject(b.bridge_id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                </>}
                {b.status === "error" && <button onClick={() => onRetry(b.bridge_id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Ponów</button>}
              </div>
            </div>
          </Card>
        ))}
        {bridge.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień dropship.</p>}
      </div>
    </>
  );
}

// ── ZWROTY ──────────────────────────────────────────────────────────
function Zwroty() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows((await listReturns()) as any[]); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function onResolve(id: string, ok: boolean) { await resolveReturn(id, ok); await load(); }
  return (
    <>
      <div className="mb-4 text-sm" style={{ color: "var(--mut)" }}>{rows.length} zgłoszeń</div>
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card key={r.return_id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">Zam. {String(r.order_id).slice(0, 8)} · {zl(r.refund_amount)}</div>
                <div className="text-xs truncate" style={{ color: "var(--mut)" }}>{r.reason}</div>
              </div>
              {r.status === "requested"
                ? <div className="flex gap-2 shrink-0">
                    <button onClick={() => onResolve(r.return_id, true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Zwróć na portfel</button>
                    <button onClick={() => onResolve(r.return_id, false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                  </div>
                : <span className="text-xs shrink-0" style={{ color: "var(--mut)" }}>{r.status}</span>}
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zgłoszeń.</p>}
      </div>
    </>
  );
}
