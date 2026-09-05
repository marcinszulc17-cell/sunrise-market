// Strona główna na dużym ekranie sunrisemarket.pl — wg wzoru właściciela (2026-09-05): prawie czarne tło, akcent amber,
// nagłówek z centralną wyszukiwarką, pasek działów, hero z grafiką „wschód słońca” (SVG, bez zdjęć stockowych),
// 5 kafli działów w rzędzie, „Polecane ogłoszenia” (4 kolumny), „Popularne kategorie”, zwięzła stopka.
// Wyłącznie warstwa UI — dane z istniejących RPC przez HomeShared; pełny katalog (filtry, banery, Strefa Energii) pod /sklep.
// Na telefonie (≤ 640 px) pokazywany jest Start.tsx. Świadomie pominięte (brak takich funkcji/stron): lokalizacja użytkownika,
// „Porady i artykuły”, „Pomoc”, „O nas”, social media, „x godz. temu” (RPC nie zwracają daty).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import NotificationsBell from "../components/NotificationsBell";
import { useCart } from "../lib/cart";
import { useSeo } from "../lib/seo";
import { Ico, IconTile, SECTIONS, RecoCard, HomeFooter, useHomeFeed, usePopularCategories, GOLD_GRAD, CARD } from "../components/home/HomeShared";

// Pasek działów — tylko istniejące trasy. Po prawej: Dla firm (/sprzedawca/dolacz), Kontakt (/legal/kontakt.html).
const MENU: { to: string; label: string; home?: boolean }[] = [
  { to: "/", label: "Strona główna", home: true },
  { to: "/sklep", label: "Zakupy" },
  { to: "/szukaj?tryb=appointment", label: "Rezerwacje" },
  { to: "/nieruchomosci", label: "Nieruchomości" },
  { to: "/motoryzacja", label: "Motoryzacja" },
  { to: "/szukaj?kat=uslugi-i-reklama", label: "Usługi" },
  { to: "/szukaj?kat=oze-i-energia", label: "OZE i Energia" },
];

function SunriseArt() {
  // Oryginalna grafika: niebo, poświata słońca i sylwetki wzgórz — lekki SVG zamiast zdjęcia.
  return <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B0B0D" /><stop offset=".55" stopColor="#1A1410" /><stop offset="1" stopColor="#3A2410" /></linearGradient>
      <radialGradient id="sun" cx="1060" cy="330" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#FFD08A" stopOpacity=".95" /><stop offset=".18" stopColor="#F5A623" stopOpacity=".75" /><stop offset=".5" stopColor="#E8891A" stopOpacity=".25" /><stop offset="1" stopColor="#E8891A" stopOpacity="0" /></radialGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0B0B0D" stopOpacity=".92" /><stop offset=".55" stopColor="#0B0B0D" stopOpacity=".35" /><stop offset="1" stopColor="#0B0B0D" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="1440" height="520" fill="url(#sky)" />
    <circle cx="1060" cy="330" r="420" fill="url(#sun)" />
    <path d="M0 400 C180 340 300 360 420 320 C560 275 640 300 760 330 C880 360 960 300 1080 310 C1200 320 1300 290 1440 300 L1440 520 L0 520 Z" fill="#15110D" />
    <path d="M0 440 C160 400 280 430 400 400 C540 370 620 420 760 410 C900 400 1000 360 1120 380 C1260 405 1340 380 1440 370 L1440 520 L0 520 Z" fill="#0E0C0A" />
    <rect width="1440" height="520" fill="url(#fade)" />
  </svg>;
}

export default function Home() {
  const navigate = useNavigate();
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [q, setQ] = useState("");
  const { rows: reco, personalized, watched, heart, rate } = useHomeFeed(8);
  const popular = usePopularCategories();
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Płać Sunrise Pay, odbieraj 3% cashbacku, kupuj z Ochroną Kupujących.", "/");
  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }

  const tiles = SECTIONS.slice(0, 5);
  const navBtn = "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]";

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    {/* ── Nagłówek ──────────────────────────────────────────────── */}
    <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-6 py-3 lg:flex-nowrap lg:gap-5 xl:px-10">
        <a href="/" className="flex shrink-0 items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-12 w-auto" /></a>
        <form onSubmit={submit} role="search" className="order-last flex w-full max-w-2xl basis-full items-center overflow-hidden rounded-xl lg:order-none lg:mx-auto lg:basis-auto" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)" }}>
          <span className="pl-4" style={{ color: "var(--mut)" }}><Ico name="search" size={20} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj produktów, usług, ogłoszeń…" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" style={{ color: "var(--ink)" }} aria-label="Szukaj" />
          <button type="submit" className="h-11 shrink-0 px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Szukaj</button>
        </form>
        <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label="Konto">
          <ThemeToggle />
          <NotificationsBell />
          <Link to="/koszyk" aria-label={cartN > 0 ? `Koszyk, ${cartN} szt.` : "Koszyk"} className={`icon-btn relative ${navBtn}`}><Ico name="cart" size={20} />{cartN > 0 && <span className="absolute right-0 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: "var(--gold)", color: "#101012" }}>{cartN}</span>}</Link>
          <Link to="/konto" className={navBtn}><Ico name="user" size={20} /><span className="hidden xl:inline">Moje konto</span></Link>
          <Link to="/obserwowane" className={navBtn}><Ico name="heart" size={20} /><span className="hidden xl:inline">Ulubione</span></Link>
          <Link to="/sprzedawca/wystaw" className="ml-2 flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold shadow-[0_6px_20px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}><span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: "rgba(0,0,0,.2)" }}><Ico name="plus" size={12} strokeWidth={2.6} /></span><span className="hidden md:inline">Dodaj ogłoszenie</span><span className="md:hidden">Dodaj</span></Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1440px] items-center px-6 xl:px-10" style={{ borderTop: "1px solid var(--line)" }}>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm" aria-label="Działy" style={{ scrollbarWidth: "none" }}>
          {MENU.map((m) => <Link key={m.label} to={m.to} aria-current={m.home ? "page" : undefined} className="flex h-11 items-center gap-1.5 whitespace-nowrap px-3 font-medium transition hover:text-[var(--ink)]" style={{ color: m.home ? "var(--gold)" : "var(--mut)", boxShadow: m.home ? "inset 0 -2px 0 var(--gold)" : "none" }}>{m.home && <Ico name="home" size={16} />}{m.label}</Link>)}
        </nav>
        <nav className="ml-auto hidden items-center gap-1 text-sm lg:flex" aria-label="Więcej">
          <Link to="/sprzedawca/dolacz" className="flex h-11 items-center px-3 font-medium navlink">Dla firm</Link>
          <a href="/legal/kontakt.html" className="flex h-11 items-center px-3 font-medium navlink">Kontakt</a>
        </nav>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-6 xl:px-10">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative mt-6 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)", minHeight: 300 }}>
        <SunriseArt />
        <div className="relative flex min-h-[300px] flex-col justify-center px-10 py-12 xl:min-h-[340px] xl:px-14">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight xl:text-5xl">Wszystko,<br /><span style={{ color: "var(--gold)" }}>czego potrzebujesz</span><br />w jednym miejscu.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 xl:text-base" style={{ color: "rgba(245,245,247,.82)" }}>Zakupy. Rezerwacje. Nieruchomości. Motoryzacja. Usługi.<br />Sunrise Market — bliżej Twoich spraw.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/sklep" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Przeglądaj oferty</Link>
            <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-semibold backdrop-blur transition hover:opacity-90" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)" }}>Dodaj ogłoszenie</Link>
          </div>
        </div>
        <div aria-hidden="true" className="font-display pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 -rotate-6 text-right text-2xl italic leading-tight lg:block xl:text-3xl" style={{ color: "#FFE0A8", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>Więcej możliwości<br />na każdy dzień.</div>
      </section>

      {/* ── Kafle działów ─────────────────────────────────────── */}
      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Działy">
        {tiles.map((t) => <Link key={t.title} to={t.to} className="group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]" style={CARD} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,166,35,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}>
          <IconTile name={t.icon} tint={t.tint} size={52} />
          <div className="min-w-0 flex-1"><div className="font-bold">{t.title}</div><div className="mt-0.5 line-clamp-2 text-xs leading-4" style={{ color: "var(--mut)" }}>{t.desc}</div></div>
          <span aria-hidden="true" className="text-xl transition group-hover:translate-x-0.5" style={{ color: "var(--mut)" }}>›</span>
        </Link>)}
      </section>

      {/* ── Polecane ogłoszenia ───────────────────────────────── */}
      <section className="mt-10" aria-labelledby="reco-h">
        <div className="flex items-end justify-between gap-4">
          <div className="border-l-4 pl-4" style={{ borderColor: "var(--gold)" }}><h2 id="reco-h" className="text-2xl font-bold">{personalized ? "Dla Ciebie" : "Polecane ogłoszenia"}</h2><p className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>{personalized ? "Oferty dobrane na podstawie tego, co oglądasz i kupujesz." : "Aktualne oferty od sprzedawców Sunrise Market."}</p></div>
          <Link to="/sklep" className="flex h-10 items-center gap-1 rounded-xl px-4 text-sm font-semibold transition hover:opacity-90" style={CARD}>Zobacz wszystkie ›</Link>
        </div>
        {reco === null ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={CARD} />)}</div>
        : reco.length === 0 ? <div className="mt-5 rounded-2xl p-8 text-center text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak polecanych ogłoszeń. <Link to="/sklep" style={{ color: "var(--gold)" }}>Przeglądaj katalog ›</Link></div>
        : <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {reco.map((o) => <RecoCard key={o.offer_id} o={o} fav={watched.has(o.offer_id)} onFav={heart} rate={rate} />)}
        </div>}
      </section>

      {/* ── Popularne kategorie ───────────────────────────────── */}
      {popular.length > 0 && <section className="mt-10" aria-labelledby="pop-h">
        <div className="flex items-end justify-between gap-4">
          <h2 id="pop-h" className="border-l-4 pl-4 text-2xl font-bold" style={{ borderColor: "var(--gold)" }}>Popularne kategorie</h2>
          <Link to="/sklep" className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition hover:opacity-90" style={CARD}>Zobacz wszystkie ›</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {popular.map((c) => <Link key={c.id} to={`/szukaj?kat=${encodeURIComponent(c.slug)}`} className="flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium transition hover:-translate-y-0.5" style={CARD} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,166,35,.45)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}><Ico name="bag" size={16} stroke="var(--gold)" />{c.name} <span style={{ color: "var(--mut)" }}>· {c.count}</span></Link>)}
        </div>
      </section>}

      {/* ── Sprzedawaj ────────────────────────────────────────── */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-8" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.16),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
        <div className="max-w-2xl"><div className="text-xl font-bold">Sprzedajesz? Wystaw ogłoszenie w kilka minut.</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>Produkt, usługa, auto albo mieszkanie — pierwszy rok bez opłat. Pieniądze zabezpiecza Ochrona Kupujących, klient płaci Sunrise Pay, kartą albo BLIK-iem i dostaje 3% cashbacku.</p></div>
        <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj ogłoszenie</Link>
      </section>
    </div>

    <HomeFooter />
  </main>;
}
