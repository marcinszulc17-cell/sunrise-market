import { pkt } from "../lib/money";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { walletBalance, myOrders, myReturns, confirmDelivery, openReturn, myWatchlist, walletHistory, toggleWatch, mySeller, amiOperator, energyReferral, memberStatus, type WalletLive, type EnergyReferral, type MemberStatus } from "../lib/api";
import { setMode } from "../lib/mode";
import { useSeo } from "../lib/seo";

const zl = (v: number) => Math.round(Number(v || 0)).toLocaleString("pl-PL") + " zł";
const dt = (s: string) => new Date(s).toLocaleString("pl-PL");

type Tab = "przeglad" | "zamowienia" | "portfel" | "zyczenia" | "ustawienia";
const TABS: { id: Tab; label: string }[] = [
  { id: "przeglad", label: "🏠 Przegląd" },
  { id: "zamowienia", label: "📦 Zamówienia" },
  { id: "portfel", label: "💳 Portfel" },
  { id: "zyczenia", label: "♥ Lista życzeń" },
  { id: "ustawienia", label: "⚙️ Ustawienia" },
];
const statusLabel: Record<string, string> = { created: "Utworzone", paid: "Opłacone", shipped: "Wysłane", delivered: "Dostarczone", completed: "Zakończone", cancelled: "Anulowane", disputed: "Spór" };
const opLabel: Record<string, string> = { topup: "Doładowanie", payment: "Zakup", cashback: "Cashback", refund: "Zwrot", payout: "Wypłata" };

export default function Konto() {
  useSeo("Moje konto", "Panel klienta Sunrise Market — portfel, zamówienia, lista życzeń.", "/konto");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<Tab>("przeglad");
  const [seller, setSeller] = useState<any>(null);
  const [isOp, setIsOp] = useState(false);
  const [w, setW] = useState<WalletLive | null>(null);
  const [ms, setMs] = useState<MemberStatus | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true); setEmail(data.user.email ?? "");
      try { setW(await walletBalance()); } catch { /* ignore */ }
      try { setSeller(await mySeller()); } catch { /* ignore */ }
      try { setIsOp(await amiOperator()); } catch { /* ignore */ }
      try { setMs(await memberStatus()); } catch { /* ignore */ }
    });
  }, []);
  async function logout() { await supabase.auth.signOut(); window.location.href = "/"; }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="text-sm navlink">← Sklep</a>
        </div>
        {authed && (
          <div className="mx-auto max-w-4xl px-4 pb-2 flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className="shrink-0 text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={tab === t.id ? { background: "linear-gradient(135deg,#C8965A,#A97B42)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>{t.label}</button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-1">Moje konto</h1>
        {email && <p className="text-sm mb-6" style={{ color: "var(--mut)" }}>{email}</p>}
        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}

        {authed && tab === "przeglad" && <Przeglad w={w} ms={ms} seller={seller} isOp={isOp} onLogout={logout} goTab={setTab} />}
        {authed && tab === "zamowienia" && <Zamowienia />}
        {authed && tab === "portfel" && <Portfel w={w} />}
        {authed && tab === "zyczenia" && <Zyczenia />}
        {authed && tab === "ustawienia" && <Ustawienia email={email} seller={seller} isOp={isOp} onLogout={logout} />}
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{children}</div>;
}

function Przeglad({ w, ms, seller, isOp, onLogout, goTab }: { w: WalletLive | null; ms: MemberStatus | null; seller: any; isOp: boolean; onLogout: () => void; goTab: (t: Tab) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ClubCard w={w} ms={ms} goTab={goTab} />
      {w && !w.linked && <Card className="!p-4"><span className="text-sm" style={{ color: "#8fe3ef" }}>Portfel niepołączony z MySunrise. Aktywuj Sunrise Pay w aplikacji MySunrise na ten sam e‑mail, aby płacić.</span></Card>}
      <PolecajPV />
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => goTab("zamowienia")} className="text-left"><Card><div className="text-lg mb-1">📦 Moje zamówienia</div><div className="text-xs" style={{ color: "var(--mut)" }}>Status, dostawa, zwroty</div></Card></button>
        <button onClick={() => goTab("zyczenia")} className="text-left"><Card><div className="text-lg mb-1">♥ Lista życzeń</div><div className="text-xs" style={{ color: "var(--mut)" }}>Zapisane produkty</div></Card></button>
        {seller
          ? <a href="/sprzedawca" onClick={() => setMode("seller")}><Card><div className="text-lg mb-1">🏪 Panel sprzedawcy</div><div className="text-xs" style={{ color: "var(--mut)" }}>Oferty, sprzedaż, portfel</div></Card></a>
          : <a href="/sprzedawca"><Card><div className="text-lg mb-1">🏪 Zostań sprzedawcą</div><div className="text-xs" style={{ color: "var(--mut)" }}>Sprzedawaj w Sunrise Market</div></Card></a>}
        {isOp && <a href="/operator"><Card><div className="text-lg mb-1">🛡️ Back-office</div><div className="text-xs" style={{ color: "var(--mut)" }}>Panel operatora</div></Card></a>}
      </div>
      <button onClick={onLogout} className="self-start text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyloguj</button>
    </div>
  );
}

function ClubCard({ w, ms, goTab }: { w: WalletLive | null; ms: MemberStatus | null; goTab: (t: Tab) => void }) {
  const amb = !!ms?.ambassador;
  const name = amb ? "AMBASSADOR CLUB" : "FAMILY CLUB";
  const sub = amb ? "Twój program partnerski Sunrise" : "Cashback dla całej rodziny";
  return (
    <div style={{ background: amb ? "linear-gradient(140deg,#1a1206,#2a1c08 42%,#0E1729)" : "linear-gradient(140deg,#0b1a34,#0e2350 45%,#123a86)", border: "1px solid rgba(232,200,150,.3)", borderRadius: 20, padding: 22, color: "#EDE7D6", boxShadow: "0 22px 48px -24px rgba(0,0,0,.8)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,#E8C896,#C8965A)", display: "grid", placeItems: "center", fontSize: 22, color: "#241606" }}>{amb ? "★" : "☀"}</div>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: ".12em", fontSize: 15 }}>SUNRISE <span style={{ color: "#E8C896" }}>{name}</span></div>
            <div style={{ fontSize: 12.5, color: "rgba(237,231,214,.6)" }}>{sub}</div>
          </div>
        </div>
        <a href="https://mysunrise.com.pl" target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 10, background: "rgba(232,200,150,.14)", border: "1px solid rgba(232,200,150,.32)", color: "#E8C896" }}>Moje MySunrise →</a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <div style={{ background: "rgba(232,200,150,.07)", borderRadius: 14, padding: "12px 15px", border: "1px solid rgba(232,200,150,.14)" }}>
          <div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Portfel Sunrise Pay</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#E8C896" }}>{zl(w?.balance ?? 0)}</div>
        </div>
        <div style={{ background: "rgba(232,200,150,.07)", borderRadius: 14, padding: "12px 15px", border: "1px solid rgba(232,200,150,.14)" }}>
          <div style={{ fontSize: 12, color: "rgba(237,231,214,.6)" }}>Punkty (cashback)</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#9BC7AE" }}>{pkt(w?.points ?? 0)} <span style={{ fontSize: 14 }}>pkt</span>{w?.gold != null ? <span style={{ fontSize: 13, color: "#E8C896" }}> · {w.gold.toLocaleString("pl-PL")} g Gold</span> : null}</div>
        </div>
      </div>
      {amb && ms?.referral_code && <AmbLink code={ms.referral_code} />}
      <div className="flex mt-3">
        <button onClick={() => goTab("portfel")} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 11, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", border: 0, cursor: "pointer" }}>Zamień punkty na zł / historia</button>
      </div>
    </div>
  );
}

function AmbLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `https://sunrisemarket.pl/?ref=${code}`;
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }
  return (
    <div style={{ marginTop: 14, background: "rgba(232,200,150,.07)", borderRadius: 14, padding: "12px 15px", border: "1px solid rgba(232,200,150,.14)" }}>
      <div style={{ fontSize: 12, color: "rgba(237,231,214,.6)", marginBottom: 6 }}>Twój link polecający do Marketu — prowizja od zakupów marki własnej Sunrise</div>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(232,200,150,.25)", color: "#EDE7D6" }} />
        <button onClick={copy} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 11, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", border: 0, cursor: "pointer" }}>{copied ? "Skopiowano ✓" : "Kopiuj link"}</button>
      </div>
    </div>
  );
}

function PolecajPV() {
  const [r, setR] = useState<EnergyReferral | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { energyReferral().then(setR).catch(() => setR({ available: false })); }, []);
  const rewardPct = r?.reward_pct ?? 5;
  const link = r?.link ?? "";
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }
  return (
    <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(200,150,90,.12), rgba(56,224,240,.08))", border: "1px solid rgba(200,150,90,.3)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">☀️</span>
        <span className="font-display text-lg font-semibold">Poleć fotowoltaikę — zgarnij do portfela</span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--mut)" }}>
        Poleć znajomego na instalację Sunrise Energy. Gdy podpisze umowę, <b style={{ color: "var(--gold)" }}>{rewardPct}% wartości</b> trafia na Twój portfel Sunrise Pay — do wydania w Markecie. Zasila portfel bez opłat.
      </p>
      {r && r.available ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input readOnly value={link} className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
            <button onClick={copy} className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{copied ? "Skopiowano ✓" : "Kopiuj link"}</button>
          </div>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--mut)" }}>
            <span>W toku: <b style={{ color: "var(--ink)" }}>{r.pending ?? 0}</b></span>
            <span>Umowy: <b style={{ color: "var(--green)" }}>{r.converted ?? 0}</b></span>
            <span>Na portfelu: <b style={{ color: "var(--gold)" }}>{zl(r.credited ?? 0)}</b></span>
          </div>
        </>
      ) : (
        <a href="https://mysunrise.com.pl" target="_blank" rel="noopener" className="inline-block rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Poleć przez MySunrise →</a>
      )}
    </div>
  );
}

function Zamowienia() {
  const [orders, setOrders] = useState<any[]>([]);
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setOrders((await myOrders()) as any[]);
      const r = (await myReturns()) as { order_id: string; status: string }[];
      setReturns(Object.fromEntries(r.map((x) => [x.order_id, x.status])));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function onConfirm(id: string) { await confirmDelivery(id); await load(); }
  async function onReturn(id: string) { const reason = window.prompt("Powód zwrotu / reklamacji:"); if (reason === null) return; try { await openReturn(id, reason); await load(); } catch (e) { alert((e as Error).message); } }
  const retLabel: Record<string, string> = { requested: "Zwrot: w trakcie", approved: "Zwrot: zaakceptowany", refunded: "Zwrot: zwrócono na portfel", rejected: "Zwrot: odrzucony" };

  if (loading) return <p style={{ color: "var(--mut)" }}>Ładowanie…</p>;
  if (orders.length === 0) return <p style={{ color: "var(--mut)" }}>Brak zamówień. <a href="/" className="text-amber-400 underline">Zacznij zakupy</a>.</p>;
  return (
    <div className="flex flex-col gap-3">
      {orders.map((o) => (
        <Card key={o.order_id}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs" style={{ color: "var(--mut)" }}>{dt(o.created_at)} · nr {String(o.order_id).slice(0, 8)}</div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{statusLabel[o.status] ?? o.status}</span>
          </div>
          <div className="flex flex-col gap-1 mb-2">
            {(o.items ?? []).map((it: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <a href={`/produkt/${it.offer_id}`} className="hover:text-amber-300">{it.title} × {it.qty}</a>
                <span style={{ color: "var(--mut)" }}>{zl(it.price * it.qty)}</span>
              </div>
            ))}
          </div>
          {(o.shipping_method || o.tracking_no) && <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>🚚 {o.shipping_method ?? "—"}{o.tracking_no ? ` · ${o.tracking_no}` : ""}</div>}
          <div className="flex items-center gap-2">
            {o.status === "shipped" && <button onClick={() => onConfirm(o.order_id)} className="text-sm font-semibold px-4 py-2 rounded-xl text-black" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>Potwierdź odbiór</button>}
            {returns[o.order_id]
              ? <span className="text-sm" style={{ color: "var(--gold)" }}>{retLabel[returns[o.order_id]] ?? returns[o.order_id]}</span>
              : (["paid", "shipped", "delivered"].includes(o.status) && <button onClick={() => onReturn(o.order_id)} className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zwróć / reklamuj</button>)}
            <div className="ml-auto text-xs" style={{ color: "var(--green)" }}>+{Math.round(o.cashback).toLocaleString("pl-PL")} pkt</div>
            <div className="font-display text-lg font-semibold">{zl(o.total)}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Portfel({ w }: { w: WalletLive | null }) {
  const [ops, setOps] = useState<any[]>([]);
  useEffect(() => { walletHistory().then(setOps).catch(() => {}); }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="ring-1 ring-amber-500/20"><div className="text-sm" style={{ color: "var(--mut)" }}>Saldo Sunrise Pay</div><div className="text-3xl font-extrabold" style={{ color: "var(--gold)" }}>{zl(w?.balance ?? 0)}</div></Card>
        <Card className="ring-1 ring-emerald-500/20"><div className="text-sm" style={{ color: "var(--mut)" }}>Punkty (cashback)</div><div className="text-3xl font-extrabold" style={{ color: "var(--green)" }}>{pkt(w?.points ?? 0)} <span className="text-lg">pkt</span></div></Card>
        {w?.gold != null && <Card className="ring-1 ring-yellow-500/20"><div className="text-sm" style={{ color: "var(--mut)" }}>Gold Pay</div><div className="text-3xl font-extrabold" style={{ color: "#E8C896" }}>{w.gold.toLocaleString("pl-PL")} <span className="text-lg">g</span></div></Card>}
      </div>
      <Card>
        <div className="text-sm mb-2" style={{ color: "var(--mut)" }}>Doładowanie robisz w MySunrise — to ten sam portfel Sunrise Pay, środki od razu są tutaj.</div>
        <a href="https://mysunrise.com.pl" target="_blank" rel="noopener" className="inline-block rounded-xl px-5 py-2.5 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Doładuj w MySunrise →</a>
        <p className="text-xs mt-3" style={{ color: "var(--mut)" }}>Wkrótce doładujesz też bezpośrednio tutaj (przelew) — gdy MySunrise uruchomi tę opcję.</p>
      </Card>
      <div>
        <h2 className="font-semibold mb-2">Historia</h2>
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

function Zyczenia() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows(await myWatchlist()); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function onRemove(id: string) { try { await toggleWatch(id); await load(); } catch { /* ignore */ } }
  if (loading) return <p style={{ color: "var(--mut)" }}>Ładowanie…</p>;
  if (rows.length === 0) return <p style={{ color: "var(--mut)" }}>Lista życzeń pusta. Kliknij ♡ na produkcie, aby dodać.</p>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
      {rows.map((o) => (
        <Card key={o.offer_id}>
          <a href={`/produkt/${o.offer_id}`} className="font-medium hover:text-amber-300">{o.title}</a>
          <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>{o.seller} · {o.category}</div>
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-semibold">{zl(o.price_gross)}</span>
            {o.price_dropped && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(122,184,154,.14)", color: "var(--green)" }}>Cena spadła</span>}
          </div>
          <div className="flex gap-2 mt-3">
            <a href={`/produkt/${o.offer_id}`} className="flex-1 text-center text-sm font-semibold py-2 rounded-xl text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Zobacz</a>
            <button onClick={() => onRemove(o.offer_id)} className="text-sm px-3 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>♥</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Ustawienia({ email, seller, isOp, onLogout }: { email: string; seller: any; isOp: boolean; onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-sm mb-1" style={{ color: "var(--mut)" }}>E‑mail konta</div>
        <div className="font-medium">{email}</div>
      </Card>
      <Card>
        <div className="text-sm mb-3" style={{ color: "var(--mut)" }}>Role i panele</div>
        <div className="flex flex-wrap gap-2">
          <a href="/" className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🛍️ Konto klienta</a>
          {seller
            ? <a href="/sprzedawca" onClick={() => setMode("seller")} className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🏪 Panel sprzedawcy</a>
            : <a href="/sprzedawca" className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🏪 Zostań sprzedawcą</a>}
          {isOp && <a href="/operator" className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🛡️ Back-office</a>}
        </div>
      </Card>
      <Card>
        <div className="text-sm mb-2" style={{ color: "var(--mut)" }}>Płatności</div>
        <p className="text-xs" style={{ color: "var(--mut)" }}>Zakupy opłacasz wyłącznie z portfela Sunrise Pay. Po zakupie 3% wraca jako punkty. Portfel jest wspólny z aplikacją MySunrise (wiązany po e‑mailu).</p>
      </Card>
      <button onClick={onLogout} className="self-start text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyloguj</button>
    </div>
  );
}
