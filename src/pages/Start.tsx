// Ekran startowy „hub” (decyzja właściciela 2026-09-05, wg grafiki „Kupuj. Rezerwuj. Zarabiaj.”):
// logo + wyszukiwarka, duże kafle działów, „Polecane ogłoszenia” z ♡, wejście dla sprzedających.
// Pokazywany na telefonie (≤ 640 px) i na app.sunrisemarket.pl; na dużym ekranie sunrisemarket.pl zostaje pełna strona główna.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recommendedOffers, homePromoted, toggleWatch, watchedIds } from "../lib/api";
import { getMarketConfig, cashbackFor } from "../lib/marketConfig";
import { supabase } from "../lib/supabase";
import { useCart } from "../lib/cart";
import { zl } from "../lib/money";
import NotificationsBell from "../components/NotificationsBell";

type Reco = { offer_id: string; title: string; price_gross: number; image_url: string | null; category: string | null; seller: string | null; rating?: number; reviews?: number; city?: string | null };

const ICONS: Record<string, JSX.Element> = {
  bag: <path d="M6 8h12l1 12H5L6 8zm3 0V6a3 3 0 0 1 6 0v2" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h2" /></>,
  house: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  car: <><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5H3z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /><path d="M5 13h14" /></>,
  wrench: <><path d="M14 4a4 4 0 0 0-3.6 5.7L4 16.1V20h3.9l6.4-6.4A4 4 0 0 0 20 10l-2.6 1.4L15.6 9 17 6.4 14 4z" /></>,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
};
const TILES: { to: string; icon: keyof typeof ICONS; title: string; sub: string }[] = [
  { to: "/szukaj", icon: "bag", title: "Zakupy", sub: "Produkty dla Ciebie" },
  { to: "/szukaj?tryb=appointment", icon: "calendar", title: "Rezerwacje", sub: "Usługi i terminy" },
  { to: "/nieruchomosci", icon: "house", title: "Nieruchomości", sub: "Domy i lokale" },
  { to: "/motoryzacja", icon: "car", title: "Motoryzacja", sub: "Pojazdy i części" },
  { to: "/szukaj?kat=uslugi-i-reklama", icon: "wrench", title: "Usługi", sub: "Fachowcy i firmy" },
  { to: "/szukaj?kat=oze-i-energia", icon: "bolt", title: "OZE i Energia", sub: "PV, pompy ciepła" },
];

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,rgba(232,200,150,.22),rgba(200,150,90,.08))", border: "1px solid rgba(232,200,150,.35)" }}>
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#E8C896" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
  </div>;
}

export default function Start() {
  const navigate = useNavigate();
  const cart = useCart();
  const [q, setQ] = useState("");
  const [reco, setReco] = useState<Reco[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState(0.03);
  const [authed, setAuthed] = useState(false);
  const cartN = cart.reduce((n, x) => n + x.qty, 0);

  useEffect(() => {
    getMarketConfig().then((c) => setRate(c.cashbackRate));
    (async () => {
      let rows: Reco[] = [];
      try { rows = (await recommendedOffers(9)) as Reco[]; } catch { /* brak */ }
      if (rows.length < 6) { try { const promo = (await homePromoted()) as any[]; rows = [...rows, ...promo.filter((p) => !rows.some((r) => r.offer_id === p.offer_id))].slice(0, 9); } catch { /* brak */ } }
      setReco(rows);
    })();
    supabase.auth.getSession().then(({ data }) => { if (data.session) { setAuthed(true); watchedIds().then((ids) => setWatched(new Set(ids))).catch(() => {}); } });
  }, []);

  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }
  async function heart(id: string) {
    if (!authed) { navigate(`/login?next=${encodeURIComponent("/")}`); return; }
    setWatched((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    try { await toggleWatch(id); } catch { /* stan odświeży się przy następnym wejściu */ }
  }

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <a href="/" className="flex items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" /></a>
        <div className="flex-1" />
        <NotificationsBell />
        <a href="/koszyk" aria-label="Koszyk" className="relative grid h-9 w-9 place-items-center rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🛒{cartN > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-black" style={{ background: "var(--gold)" }}>{cartN}</span>}</a>
      </div>
    </header>

    <div className="mx-auto max-w-5xl px-4 pb-8">
      <section className="pt-5 text-center">
        <div className="text-[11px] font-semibold tracking-[.28em]" style={{ color: "var(--gold)" }}>KUPUJ. REZERWUJ. ZARABIAJ.</div>
        <form onSubmit={submit} className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <span aria-hidden="true" style={{ color: "var(--mut)" }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj produktów, usług, ogłoszeń…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" style={{ color: "var(--ink)" }} enterKeyHint="search" />
          <button type="submit" className="rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#0E1729" }}>Szukaj</button>
        </form>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map((t) => <Link key={t.title} to={t.to} className="relative flex flex-col gap-3 rounded-2xl p-4 transition active:scale-[.98]" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <Icon name={t.icon} />
          <div className="min-w-0"><div className="font-semibold leading-tight">{t.title}</div><div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{t.sub}</div></div>
          <span aria-hidden="true" className="absolute right-4 top-4" style={{ color: "var(--mut)" }}>›</span>
        </Link>)}
      </section>

      <section className="mt-6">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Polecane ogłoszenia</h2><Link to="/szukaj" className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Zobacz wszystkie ›</Link></div>
        {reco.length === 0 ? <div className="mt-3 rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Wczytuję polecane oferty…</div>
        : <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {reco.map((o) => <article key={o.offer_id} className="relative w-[46%] shrink-0 snap-start overflow-hidden rounded-2xl sm:w-auto" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <Link to={`/produkt/${o.offer_id}`} className="block aspect-square w-full" style={{ background: "var(--header)" }}>{o.image_url ? <img src={o.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">🛍️</div>}</Link>
            <button type="button" onClick={() => heart(o.offer_id)} aria-label="Obserwuj" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-sm" style={{ background: "rgba(10,18,36,.75)", color: watched.has(o.offer_id) ? "#F25CB0" : "#EDE7D6" }}>{watched.has(o.offer_id) ? "♥" : "♡"}</button>
            <div className="p-2.5">
              <Link to={`/produkt/${o.offer_id}`} className="line-clamp-2 text-sm font-semibold leading-5">{o.title}</Link>
              <div className="mt-1 font-semibold" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--mut)" }}>{o.city ? `📍 ${o.city}` : `+${cashbackFor(o.price_gross, rate).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} pkt cashback`}</div>
            </div>
          </article>)}
        </div>}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to="/sprzedawca/wystaw" className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(200,150,90,.22),rgba(200,150,90,.06))", border: "1px solid rgba(200,150,90,.4)" }}>
          <div className="font-semibold">＋ Wystaw ogłoszenie</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Sprzedaj produkt, auto, mieszkanie albo usługę — pierwszy rok bez opłat. Pieniądze zabezpiecza Ochrona Kupujących.</div>
        </Link>
        <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="font-semibold">☀️ Sunrise Pay · cashback 3%</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Płacisz portfelem, kartą albo BLIK-iem — 3% zawsze wraca na Twój portfel. Każdy zakup objęty Ochroną Kupujących.</div>
        </div>
      </section>

      <div className="mt-8 text-center text-[11px] tracking-[.22em]" style={{ color: "var(--mut)" }}>TWÓJ RYNEK WIĘKSZYCH MOŻLIWOŚCI</div>
    </div>
  </main>;
}
