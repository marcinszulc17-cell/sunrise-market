import { pkt } from "../lib/money";
import PushToggle from "../components/PushToggle";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { walletBalance, myOrders, myReturns, confirmDelivery, openReturn, myWatchlist, walletHistory, toggleWatch, mySeller, amiOperator, energyReferral, memberStatus, type WalletLive, type EnergyReferral, type MemberStatus } from "../lib/api";
import { setMode } from "../lib/mode";
import { useSeo } from "../lib/seo";

import { zl } from "../lib/money";
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
  // Po wylogowaniu zawsze strona główna sklepu. Na app.sunrisemarket.pl korzeń pokazuje gościowi ekran logowania,
  // więc tam przenosimy na publiczną domenę sklepu (decyzja właściciela 2026-09-05).
  async function logout() {
    try { await supabase.auth.signOut(); } catch { /* i tak przechodzimy dalej */ }
    const onApp = window.location.hostname.toLowerCase() === "app.sunrisemarket.pl";
    window.location.href = onApp ? "https://sunrisemarket.pl/" : "/";
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
      {w && !w.linked && <Card className="!p-4"><span className="text-sm" style={{ color: "#8fe3ef" }}>Nie udało się jeszcze odczytać portfela Sunrise. Odśwież stronę za chwilę.</span></Card>}
      <PolecajPV />
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => goTab("zamowienia")} className="text-left"><Card><div className="text-lg mb-1">📦 Moje zamówienia</div><div className="text-xs" style={{ color: "var(--mut)" }}>Status, dostawa, zwroty</div></Card></button>
        <a href="/rezerwacje"><Card><div className="text-lg mb-1">📅 Moje rezerwacje</div><div className="text-xs" style={{ color: "var(--mut)" }}>Usługi, nieruchomości i pojazdy</div></Card></a>
        <button onClick={() => goTab("zyczenia")} className="text-left"><Card><div className="text-lg mb-1">♥ Lista życzeń</div><div className="text-xs" style={{ color: "var(--mut)" }}>Zapisane produkty</div></Card></button>
        {seller
          ? <a href="/sprzedawca" onClick={() => setMode("seller")}><Card><div className="text-lg mb-1">🏪 {seller?.seller_type === "business" ? "Panel Partnera Handlowego" : "Centrum sprzedawcy"}</div><div className="text-xs" style={{ color: "var(--mut)" }}>Oferty, sprzedaż, portfel</div></Card></a>
          : <a href="/sprzedawca/dolacz"><Card><div className="text-lg mb-1">🏪 Zostań sprzedawcą</div><div className="text-xs" style={{ color: "var(--mut)" }}>Pierwszy rok gratis · Sprzedawca lub Partner Handlowy (firma)</div></Card></a>}
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
        <a href="https://app.sunrisewallet.pl/wallet" target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 10, background: "rgba(232,200,150,.14)", border: "1px solid rgba(232,200,150,.32)", color: "#E8C896" }}>Otwórz Sunrise Wallet →</a>
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
      {amb && ms?.referral_code && <AmbLink code={ms.referral_code} tier={ms.tier} />}
      <div className="flex mt-3">
        <button onClick={() => goTab("portfel")} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 11, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", border: 0, cursor: "pointer" }}>Zamień punkty na zł / historia</button>
      </div>
    </div>
  );
}

function AmbLink({ code, tier }: { code: string; tier?: string }) {
  const [copied, setCopied] = useState(false);
  const link = `https://sunrisemarket.pl/?ref=${code}`;
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }
  const rungs: [string, string, string][] = [["ambassador", "Ambasador", "5%"], ["silver", "Silver", "10%"], ["gold", "Gold", "15%"], ["platinum", "Platinum", "20%"], ["diamond", "Diament", "22%"]];
  const cur = (tier ?? "").toLowerCase();
  return (
    <div style={{ marginTop: 14, background: "rgba(232,200,150,.07)", borderRadius: 14, padding: "12px 15px", border: "1px solid rgba(232,200,150,.14)" }}>
      <div style={{ fontSize: 12, color: "rgba(237,231,214,.6)", marginBottom: 6 }}>Twój link polecający do Marketu — prowizja od zakupów marki własnej Sunrise</div>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} className="flex-1 min-w-[200px] rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(232,200,150,.25)", color: "#EDE7D6" }} />
        <button onClick={copy} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 11, background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606", border: 0, cursor: "pointer" }}>{copied ? "Skopiowano ✓" : "Kopiuj link"}</button>
      </div>
      <div style={{ fontSize: 12, color: "rgba(237,231,214,.6)", marginTop: 12, marginBottom: 6 }}>Prowizja za polecenie (od ceny brutto), zależna od Twojej rangi ambasadora:</div>
      <div className="flex flex-wrap gap-1.5">
        {rungs.map(([k, label, rate]) => {
          const active = cur === k;
          return (
            <span key={k} style={{ fontSize: 12, fontWeight: 700, padding: "4px 9px", borderRadius: 9, background: active ? "linear-gradient(135deg,#E8C896,#C8965A)" : "rgba(232,200,150,.08)", color: active ? "#241606" : "#EDE7D6", border: active ? "0" : "1px solid rgba(232,200,150,.2)" }}>
              {label} {rate}{active ? " • Ty" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Portfel({ w }: { w: WalletLive | null }) {
  const [ops, setOps] = useState<any[]>([]);
  useEffect(() => { walletHistory().then(setOps).catch(() => {}); }, []);
  return <div className="space-y-4"><Card><div className="text-sm" style={{ color: "var(--mut)" }}>Saldo Sunrise Pay</div><div className="text-3xl font-bold mt-1">{zl(w?.balance ?? 0)}</div><div className="text-sm mt-2" style={{ color: "var(--mut)" }}>Punkty: {pkt(w?.points ?? 0)} pkt{w?.gold != null ? ` · Gold: ${w.gold.toLocaleString("pl-PL")} g` : ""}</div></Card><Card><h2 className="font-semibold mb-3">Historia</h2>{ops.length === 0 ? <p className="text-sm" style={{ color: "var(--mut)" }}>Brak operacji.</p> : <div className="space-y-2">{ops.map((o) => <div key={o.id} className="flex justify-between gap-3 text-sm"><span>{opLabel[o.type] ?? o.type}</span><span className="font-semibold">{zl(Number(o.amount))}</span></div>)}</div>}</Card></div>;
}

function Zamowienia() {
  const [orders, setOrders] = useState<any[]>([]); const [returns, setReturns] = useState<any[]>([]);
  useEffect(() => { myOrders().then(setOrders).catch(() => {}); myReturns().then(setReturns).catch(() => {}); }, []);
  if (!orders.length) return <p style={{ color: "var(--mut)" }}>Nie masz jeszcze zamówień.</p>;
  return <div className="space-y-3">{orders.map((o) => <Card key={o.id}><div className="flex justify-between gap-3"><div><div className="font-semibold">Zamówienie {String(o.id).slice(0,8)}</div><div className="text-xs" style={{ color: "var(--mut)" }}>{dt(o.created_at)}</div></div><span className="text-sm">{statusLabel[o.status] ?? o.status}</span></div><div className="mt-2 font-semibold">{zl(Number(o.total))}</div>{o.status === "shipped" && <button onClick={() => confirmDelivery(o.id).then(() => location.reload())} className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: "var(--gold)", color: "#000" }}>Potwierdź odbiór</button>}{["delivered","completed"].includes(o.status) && !returns.some((r) => r.order_id === o.id) && <button onClick={() => { const reason = prompt("Powód zwrotu:"); if (reason) openReturn(o.id, reason).then(() => location.reload()); }} className="mt-3 ml-2 text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid var(--line)" }}>Zgłoś zwrot</button>}</Card>)}</div>;
}

function Zyczenia() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { myWatchlist().then(setItems).catch(() => {}); }, []);
  if (!items.length) return <p style={{ color: "var(--mut)" }}>Lista życzeń jest pusta.</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{items.map((x) => <Card key={x.id}><a href={`/produkt/${x.product_id}`} className="font-semibold">{x.product_name ?? "Produkt"}</a><button onClick={() => toggleWatch(x.product_id).then(() => setItems((v) => v.filter((i) => i.product_id !== x.product_id)))} className="block mt-2 text-xs" style={{ color: "var(--mut)" }}>Usuń z listy</button></Card>)}</div>;
}

type Consent = { channel: string; purpose: string; basis?: string | null; text?: string | null; since?: string | null; verified?: boolean };
function Zgody() {
  const [state, setState] = useState<{ consents: Consent[]; manage_url?: string } | null | "error">(null);
  useEffect(() => {
    supabase.functions.invoke("customer-consents", { body: {} }).then(({ data, error }) => {
      if (error || !data?.ok) setState("error"); else setState({ consents: data.consents ?? [], manage_url: data.manage_url });
    });
  }, []);
  return <Card>
    <div className="flex items-center justify-between gap-3"><div><div className="font-semibold">Twoje zgody</div><div className="text-xs mt-1" style={{ color: "var(--mut)" }}>Jedno miejsce dla całego ekosystemu Sunrise. Pokazujemy tylko zgody aktywne.</div></div>
      <a href={(state !== null && state !== "error" && state.manage_url) || "https://app.mysunrise.pl/profile"} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--line)" }}>Zarządzaj w MySunrise →</a></div>
    {state === null && <div className="mt-3 text-sm" style={{ color: "var(--mut)" }}>Ładuję zgody…</div>}
    {state === "error" && <div className="mt-3 text-sm" style={{ color: "var(--mut)" }}>Nie udało się pobrać zgód. Odśwież stronę za chwilę.</div>}
    {state !== null && state !== "error" && state.consents.length === 0 && <div className="mt-3 text-sm" style={{ color: "var(--mut)" }}>Brak aktywnych zgód marketingowych. Zgody na regulaminy są zapisane przy Twoim koncie MySunrise.</div>}
    {state !== null && state !== "error" && state.consents.length > 0 && <ul className="mt-3 space-y-2 text-sm">{state.consents.map((c, i) => <li key={i} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div><div className="font-medium">✓ {c.purpose}</div><div className="text-xs" style={{ color: "var(--mut)" }}>{c.channel}{c.text ? ` · ${c.text}` : ""}</div></div><div className="text-xs whitespace-nowrap" style={{ color: "var(--mut)" }}>{c.since ? new Date(c.since).toLocaleDateString("pl-PL") : ""}</div></li>)}</ul>}
  </Card>;
}

function Ustawienia({ email, seller, isOp, onLogout }: { email: string; seller: any; isOp: boolean; onLogout: () => void }) {
  return <div className="space-y-4"><Card><div className="text-sm" style={{ color: "var(--mut)" }}>E-mail</div><div className="font-semibold mt-1">{email}</div></Card><PushToggle /><Zgody /><Card><div className="text-sm" style={{ color: "var(--mut)" }}>Rola</div><div className="font-semibold mt-1">{isOp ? "Operator" : seller ? (seller.seller_type === "business" || seller.seller_type === "sunrise" ? "Partner Handlowy" : "Sprzedawca") : "Klient"}</div></Card><button onClick={onLogout} className="text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyloguj</button></div>;
}

function PolecajPV() {
  const [r, setR] = useState<EnergyReferral | null>(null);
  useEffect(() => { energyReferral().then(setR).catch(() => {}); }, []);
  const link = r?.link || (r?.code ? `https://sunriseenergy.pl/?ref=${r.code}` : "");
  return <Card><div className="font-semibold">Polecaj Sunrise Energy</div><div className="text-sm mt-1" style={{ color: "var(--mut)" }}>Polecaj fotowoltaikę i rozwiązania energetyczne. Twój link zapisuje polecenie do programu Sunrise.</div>{link ? <div className="mt-3 flex gap-2"><input readOnly value={link} className="flex-1 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /><button onClick={() => navigator.clipboard.writeText(link)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--gold)", color: "#000" }}>Kopiuj</button></div> : <div className="mt-3 text-xs" style={{ color: "var(--mut)" }}>{r === null ? "Ładuję Twój link polecający…" : r.reason === "no_code" ? "Twoje konto nie ma jeszcze kodu polecającego — dołącz do Sunrise Family Club w MySunrise, a link pojawi się tutaj." : "Program poleceń jest chwilowo niedostępny. Odśwież stronę za chwilę."}</div>}</Card>;
}