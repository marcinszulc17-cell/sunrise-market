// Strona główna na dużym ekranie sunrisemarket.pl (decyzja właściciela 2026-09-05: „premium marketplace”).
// Wyłącznie warstwa UI — dane z istniejących RPC (recommended_offers, home_promoted, category_counts, toggle_watch),
// istniejące trasy i kategorie. Pełny katalog z filtrami, banerami i Strefą Energii został pod /sklep (MarketEnhanced);
// wpisanie frazy w wyszukiwarce prowadzi do /szukaj?q=. Na telefonie (≤ 640 px) pokazywany jest Start.tsx.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import NotificationsBell from "../components/NotificationsBell";
import MarketFooter from "../components/MarketFooter";
import { recommendedOffers, homePromoted, toggleWatch, watchedIds, categoryCounts } from "../lib/api";
import { getMarketConfig, cashbackFor } from "../lib/marketConfig";
import { supabase } from "../lib/supabase";
import { useCart } from "../lib/cart";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";

type Reco = { offer_id: string; title: string; price_gross: number; image_url: string | null; category: string | null; seller: string | null; rating?: number; reviews?: number; city?: string | null };
type Cat = { id: string; slug: string; name: string };

const GOLD_GRAD = "linear-gradient(135deg,#C8965A,#E8C896)";
const ICONS: Record<string, JSX.Element> = {
  bag: <path d="M6 8h12l1 12H5L6 8zm3 0V6a3 3 0 0 1 6 0v2" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h2" /></>,
  house: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  car: <><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5H3z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /><path d="M5 13h14" /></>,
  wrench: <path d="M14 4a4 4 0 0 0-3.6 5.7L4 16.1V20h3.9l6.4-6.4A4 4 0 0 0 20 10l-2.6 1.4L15.6 9 17 6.4 14 4z" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  heart: <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  cart: <><path d="M3 4h2l2.4 11h11.2L21 8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};
function Ico({ name, size = 18, stroke = "currentColor" }: { name: keyof typeof ICONS; size?: number; stroke?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

// Menu kategorii i kafle — tylko istniejące sekcje/trasy aplikacji.
const MENU: { to: string; label: string }[] = [
  { to: "/", label: "Strona główna" },
  { to: "/sklep", label: "Zakupy" },
  { to: "/szukaj?tryb=appointment", label: "Rezerwacje" },
  { to: "/nieruchomosci", label: "Nieruchomości" },
  { to: "/motoryzacja", label: "Motoryzacja" },
  { to: "/szukaj?kat=uslugi-i-reklama", label: "Usługi" },
  { to: "/szukaj?kat=oze-i-energia", label: "OZE i Energia" },
];
const TILES: { to: string; icon: keyof typeof ICONS; title: string; desc: string; cta: string }[] = [
  { to: "/sklep", icon: "bag", title: "Zakupy", desc: "Produkty od zweryfikowanych sprzedawców, z cashbackiem i Ochroną Kupujących.", cta: "Przeglądaj produkty" },
  { to: "/szukaj?tryb=appointment", icon: "calendar", title: "Rezerwacje", desc: "Usługi z terminarzem — rezerwujesz i płacisz w jednym miejscu.", cta: "Zarezerwuj termin" },
  { to: "/nieruchomosci", icon: "house", title: "Nieruchomości", desc: "Mieszkania, domy, działki i lokale — z filtrami dopasowanymi do rynku.", cta: "Zobacz oferty" },
  { to: "/motoryzacja", icon: "car", title: "Motoryzacja", desc: "Samochody, motocykle i części — z weryfikacją Sunrise Verify.", cta: "Znajdź pojazd" },
  { to: "/szukaj?kat=uslugi-i-reklama", icon: "wrench", title: "Usługi", desc: "Fachowcy, firmy i usługi dla domu oraz biznesu.", cta: "Znajdź wykonawcę" },
  { to: "/szukaj?kat=oze-i-energia", icon: "bolt", title: "OZE i Energia", desc: "Fotowoltaika, pompy ciepła, magazyny energii i montaż.", cta: "Sprawdź oferty" },
];

export default function Home() {
  const navigate = useNavigate();
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [q, setQ] = useState("");
  const [reco, setReco] = useState<Reco[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [authed, setAuthed] = useState(false);
  const [rate, setRate] = useState(0.03);
  const [cats, setCats] = useState<Cat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Płać Sunrise Pay, odbieraj 3% cashbacku, kupuj z Ochroną Kupujących.", "/");

  useEffect(() => {
    getMarketConfig().then((c) => setRate(c.cashbackRate)).catch(() => {});
    (async () => {
      let rows: Reco[] = [];
      try { rows = (await recommendedOffers(8)) as Reco[]; } catch { /* brak */ }
      if (rows.length < 8) { try { const promo = (await homePromoted()) as any[]; rows = [...rows, ...promo.filter((p) => p.offer_id && !rows.some((r) => r.offer_id === p.offer_id))].slice(0, 8); } catch { /* brak */ } }
      setReco(rows);
    })();
    supabase.from("categories").select("id,slug,name").is("parent_id", null).order("sort_order").then(({ data }) => setCats((data ?? []) as Cat[]));
    categoryCounts().then(({ byId }) => setCounts(byId)).catch(() => {});
    supabase.auth.getSession().then(({ data }) => { if (data.session) { setAuthed(true); watchedIds().then((ids) => setWatched(new Set(ids))).catch(() => {}); } });
  }, []);

  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }
  async function heart(id: string) {
    if (!authed) { navigate(`/login?next=${encodeURIComponent("/")}`); return; }
    setWatched((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    try { await toggleWatch(id); } catch { /* stan odświeży się przy następnym wejściu */ }
  }
  const popular = cats.filter((c) => (counts[c.id] ?? 0) > 0);

  const iconBtn = "grid h-10 w-10 place-items-center rounded-xl transition hover:opacity-90";
  const iconBtnStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as const;

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    {/* ── Nagłówek ──────────────────────────────────────────────── */}
    <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-6 py-3 xl:px-10">
        <a href="/" className="flex shrink-0 items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-12 w-auto" /></a>
        <form onSubmit={submit} role="search" className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl px-4 py-1.5 transition focus-within:shadow-[0_0_0_2px_rgba(232,200,150,.35)]" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <span style={{ color: "var(--mut)" }}><Ico name="search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Czego szukasz? Produkty, usługi, nieruchomości, pojazdy…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--ink)" }} aria-label="Szukaj" />
          <button type="submit" className="rounded-xl px-4 py-1.5 text-sm font-semibold" style={{ background: GOLD_GRAD, color: "#0E1729" }}>Szukaj</button>
        </form>
        <nav className="flex shrink-0 items-center gap-2" aria-label="Konto">
          <ThemeToggle />
          <NotificationsBell />
          <Link to="/obserwowane" aria-label="Ulubione" title="Obserwowane" className={iconBtn} style={iconBtnStyle}><Ico name="heart" /></Link>
          <Link to="/koszyk" aria-label="Koszyk" title="Koszyk" className={`${iconBtn} relative`} style={iconBtnStyle}><Ico name="cart" />{cartN > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-black" style={{ background: "var(--gold)" }}>{cartN}</span>}</Link>
          <Link to="/konto" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:opacity-90" style={iconBtnStyle}><Ico name="user" />Konto</Link>
          <Link to="/sprzedawca/wystaw" className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_6px_20px_rgba(200,150,90,.25)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#0E1729" }}><Ico name="plus" size={16} />Dodaj ogłoszenie</Link>
        </nav>
      </div>
      <div className="mx-auto max-w-[1440px] px-6 xl:px-10">
        <nav className="flex items-center gap-1 overflow-x-auto py-1 text-sm" aria-label="Kategorie">
          {MENU.map((m, i) => <Link key={m.label} to={m.to} className="whitespace-nowrap rounded-lg px-3 py-2 transition" style={{ color: i === 0 ? "var(--gold)" : "var(--mut)", fontWeight: i === 0 ? 600 : 500 }} onMouseEnter={(e) => { if (i) e.currentTarget.style.color = "var(--ink)"; }} onMouseLeave={(e) => { if (i) e.currentTarget.style.color = "var(--mut)"; }}>{m.label}</Link>)}
        </nav>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-6 xl:px-10">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative mt-8 overflow-hidden rounded-3xl px-10 py-16 xl:px-16 xl:py-20" style={{ background: "linear-gradient(135deg,rgba(232,200,150,.10),rgba(20,32,54,.35) 45%,rgba(10,18,36,.6))", border: "1px solid var(--line)", boxShadow: "0 30px 80px rgba(0,0,0,.25)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full" style={{ background: "radial-gradient(circle,rgba(232,200,150,.22),transparent 65%)" }} />
        <div className="relative max-w-3xl">
          <div className="text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight xl:text-6xl">Wszystko, czego potrzebujesz w jednym miejscu.</h1>
          <p className="mt-5 text-lg xl:text-xl" style={{ color: "var(--mut)" }}>Zakupy. Rezerwacje. Nieruchomości. Motoryzacja. Usługi.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/sklep" className="rounded-xl px-6 py-3 text-sm font-semibold shadow-[0_8px_24px_rgba(200,150,90,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#0E1729" }}>Przeglądaj oferty</Link>
            <Link to="/sprzedawca/wystaw" className="rounded-xl px-6 py-3 text-sm font-semibold transition hover:opacity-90" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Dodaj ogłoszenie</Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "var(--mut)" }}>
            <span>☀️ Cashback 3% przy każdej płatności</span><span>🛡 Ochrona Kupujących</span><span>✓ Zweryfikowani sprzedawcy</span>
          </div>
        </div>
      </section>

      {/* ── Kafle kategorii ────────────────────────────────────── */}
      <section className="mt-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TILES.map((t) => <Link key={t.title} to={t.to} className="group relative flex flex-col gap-4 rounded-2xl p-6 transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)", boxShadow: "0 10px 30px rgba(0,0,0,.15)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,200,150,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,rgba(232,200,150,.22),rgba(200,150,90,.08))", border: "1px solid rgba(232,200,150,.35)" }}><Ico name={t.icon} size={24} stroke="#E8C896" /></div>
            <div><div className="text-lg font-semibold">{t.title}</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{t.desc}</p></div>
            <div className="mt-auto text-sm font-semibold" style={{ color: "var(--gold)" }}>{t.cta} <span className="inline-block transition group-hover:translate-x-0.5">›</span></div>
          </Link>)}
        </div>
      </section>

      {/* ── Polecane ogłoszenia ───────────────────────────────── */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="text-2xl font-semibold">Polecane ogłoszenia</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Aktualne oferty od sprzedawców Sunrise Market.</p></div>
          <Link to="/sklep" className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Zobacz wszystkie ›</Link>
        </div>
        {reco === null ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />)}</div>
        : reco.length === 0 ? <div className="mt-5 rounded-2xl p-8 text-center text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Brak polecanych ogłoszeń. <Link to="/sklep" style={{ color: "var(--gold)" }}>Przeglądaj katalog ›</Link></div>
        : <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {reco.map((o) => <article key={o.offer_id} className="group relative overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)", boxShadow: "0 10px 30px rgba(0,0,0,.15)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,200,150,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>
            <Link to={`/produkt/${o.offer_id}`} className="block aspect-[4/3] w-full overflow-hidden" style={{ background: "var(--header)" }}>{o.image_url ? <img src={o.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center text-4xl">🛍️</div>}</Link>
            <button type="button" onClick={() => heart(o.offer_id)} aria-label={watched.has(o.offer_id) ? "Przestań obserwować" : "Obserwuj"} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-base backdrop-blur transition hover:scale-105" style={{ background: "rgba(10,18,36,.7)", border: "1px solid rgba(237,231,214,.15)", color: watched.has(o.offer_id) ? "#F25CB0" : "#EDE7D6" }}>{watched.has(o.offer_id) ? "♥" : "♡"}</button>
            <div className="p-4">
              {o.category && <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--gold)" }}>{o.category}</div>}
              <Link to={`/produkt/${o.offer_id}`} className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{o.title}</Link>
              <div className="mt-2 text-lg font-semibold" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--mut)" }}>
                <span className="truncate">{o.city ? `📍 ${o.city}` : o.seller ?? ""}</span>
                <span className="shrink-0">+{cashbackFor(o.price_gross, rate).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} pkt</span>
              </div>
            </div>
          </article>)}
        </div>}
      </section>

      {/* ── Popularne kategorie ───────────────────────────────── */}
      {popular.length > 0 && <section className="mt-14">
        <h2 className="text-2xl font-semibold">Popularne kategorie</h2>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {popular.map((c) => <Link key={c.id} to={`/szukaj?kat=${encodeURIComponent(c.slug)}`} className="rounded-full px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,200,150,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>{c.name} <span style={{ color: "var(--mut)" }}>· {counts[c.id]}</span></Link>)}
        </div>
      </section>}

      {/* ── Pasek dla sprzedających ───────────────────────────── */}
      <section className="mt-14 flex flex-wrap items-center justify-between gap-6 rounded-3xl px-10 py-10" style={{ background: "linear-gradient(135deg,rgba(200,150,90,.18),rgba(200,150,90,.04))", border: "1px solid rgba(200,150,90,.35)" }}>
        <div className="max-w-2xl"><div className="text-2xl font-semibold">Sprzedajesz? Wystaw ogłoszenie w kilka minut.</div><p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>Produkt, usługa, auto albo mieszkanie — pierwszy rok bez opłat. Pieniądze zabezpiecza Ochrona Kupujących, a klient płaci portfelem Sunrise Pay, kartą albo BLIK-iem.</p></div>
        <Link to="/sprzedawca/wystaw" className="rounded-xl px-6 py-3 text-sm font-semibold shadow-[0_8px_24px_rgba(200,150,90,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#0E1729" }}>Dodaj ogłoszenie</Link>
      </section>
    </div>

    <MarketFooter />
  </main>;
}
