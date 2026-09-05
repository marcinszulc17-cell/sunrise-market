// Strona główna na dużym ekranie sunrisemarket.pl (decyzja właściciela 2026-09-05: „premium marketplace”).
// Wyłącznie warstwa UI — dane z istniejących RPC (recommended_offers, home_promoted, category_counts, toggle_watch),
// istniejące trasy i kategorie. Pełny katalog z filtrami, banerami i Strefą Energii został pod /sklep (MarketEnhanced);
// wpisanie frazy w wyszukiwarce prowadzi do /szukaj?q=. Na telefonie (≤ 640 px) pokazywany jest Start.tsx.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import NotificationsBell from "../components/NotificationsBell";
import MarketFooter from "../components/MarketFooter";
import { useCart } from "../lib/cart";
import { useSeo } from "../lib/seo";
import { Ico, IconTile, SECTIONS, RecoCard, useHomeFeed, usePopularCategories, GOLD_GRAD } from "../components/home/HomeShared";

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
export default function Home() {
  const navigate = useNavigate();
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [q, setQ] = useState("");
  const { rows: reco, personalized, watched, heart, rate } = useHomeFeed(8);
  const popular = usePopularCategories();
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Płać Sunrise Pay, odbieraj 3% cashbacku, kupuj z Ochroną Kupujących.", "/");
  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }

  const iconBtn = "grid h-10 w-10 place-items-center rounded-xl transition hover:opacity-90";
  const iconBtnStyle = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" } as const;

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    {/* ── Nagłówek ──────────────────────────────────────────────── */}
    <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-6 py-3 lg:flex-nowrap lg:gap-4 xl:px-10">
        <a href="/" className="flex shrink-0 items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-12 w-auto" /></a>
        <form onSubmit={submit} role="search" className="order-last mx-auto flex w-full max-w-2xl basis-full items-center gap-2 rounded-2xl px-4 py-1.5 lg:order-none lg:basis-auto transition focus-within:shadow-[0_0_0_2px_rgba(232,200,150,.35)]" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <span style={{ color: "var(--mut)" }}><Ico name="search" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Czego szukasz? Produkty, usługi, nieruchomości, pojazdy…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--ink)" }} aria-label="Szukaj" />
          <button type="submit" className="rounded-xl px-4 py-1.5 text-sm font-semibold" style={{ background: GOLD_GRAD, color: "#0E1729" }}>Szukaj</button>
        </form>
        <nav className="ml-auto flex shrink-0 items-center gap-2" aria-label="Konto">
          <ThemeToggle />
          <NotificationsBell />
          <Link to="/obserwowane" aria-label="Ulubione" title="Obserwowane" className={iconBtn} style={iconBtnStyle}><Ico name="heart" /></Link>
          <Link to="/koszyk" aria-label="Koszyk" title="Koszyk" className={`${iconBtn} icon-btn relative`} style={iconBtnStyle}><Ico name="cart" />{cartN > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-black" style={{ background: "var(--gold)" }}>{cartN}</span>}</Link>
          <Link to="/konto" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:opacity-90" style={iconBtnStyle}><Ico name="user" /><span className="hidden lg:inline">Konto</span></Link>
          <Link to="/sprzedawca/wystaw" className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_6px_20px_rgba(200,150,90,.25)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#0E1729" }}><Ico name="plus" size={16} /><span className="hidden md:inline">Dodaj ogłoszenie</span><span className="md:hidden">Dodaj</span></Link>
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
          {SECTIONS.map((t) => <Link key={t.title} to={t.to} className="group relative flex flex-col gap-4 rounded-2xl p-6 transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)", boxShadow: "0 10px 30px rgba(0,0,0,.15)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,200,150,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>
            <IconTile name={t.icon} />
            <div><div className="text-lg font-semibold">{t.title}</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{t.desc}</p></div>
            <div className="mt-auto text-sm font-semibold" style={{ color: "var(--gold)" }}>{t.cta} <span className="inline-block transition group-hover:translate-x-0.5">›</span></div>
          </Link>)}
        </div>
      </section>

      {/* ── Polecane ogłoszenia ───────────────────────────────── */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="text-2xl font-semibold">{personalized ? "Dla Ciebie" : "Polecane ogłoszenia"}</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{personalized ? "Oferty dobrane na podstawie tego, co oglądasz i kupujesz." : "Aktualne oferty od sprzedawców Sunrise Market."}</p></div>
          <Link to="/sklep" className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Zobacz wszystkie ›</Link>
        </div>
        {reco === null ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />)}</div>
        : reco.length === 0 ? <div className="mt-5 rounded-2xl p-8 text-center text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Brak polecanych ogłoszeń. <Link to="/sklep" style={{ color: "var(--gold)" }}>Przeglądaj katalog ›</Link></div>
        : <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {reco.map((o) => <RecoCard key={o.offer_id} o={o} fav={watched.has(o.offer_id)} onFav={heart} rate={rate} />)}
        </div>}
      </section>

      {/* ── Popularne kategorie ───────────────────────────────── */}
      {popular.length > 0 && <section className="mt-14">
        <h2 className="text-2xl font-semibold">Popularne kategorie</h2>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {popular.map((c) => <Link key={c.id} to={`/szukaj?kat=${encodeURIComponent(c.slug)}`} className="rounded-full px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(232,200,150,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>{c.name} <span style={{ color: "var(--mut)" }}>· {c.count}</span></Link>)}
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
