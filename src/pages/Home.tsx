// Strona główna na dużym ekranie sunrisemarket.pl — wg wzoru właściciela (2026-09-05): prawie czarne tło, akcent amber,
// nagłówek z centralną wyszukiwarką, pasek działów, hero z grafiką „wschód słońca” (SVG, bez zdjęć stockowych),
// 5 kafli działów w rzędzie, „Polecane ogłoszenia” (4 kolumny), „Popularne kategorie”, zwięzła stopka.
// Wyłącznie warstwa UI — dane z istniejących RPC przez HomeShared; pełny katalog (filtry, banery, Strefa Energii) pod /sklep.
// Na telefonie (≤ 640 px) pokazywany jest Start.tsx. Świadomie pominięte (brak takich funkcji/stron): lokalizacja użytkownika,
// „Porady i artykuły”, „Pomoc”, „O nas”, social media, „x godz. temu” (RPC nie zwracają daty).
import { Link } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { Ico, IconTile, SECTIONS, RecoCard, HomeFooter, useHomeFeed, usePopularCategories, tileStyle, GOLD_GRAD, CARD } from "../components/home/HomeShared";
import { SiteHeader } from "../components/home/SiteChrome";
import { CITIES, SERVICE_RADIUS_KM, SERVICE_REGIONS } from "../lib/cities";

// Pasek działów — tylko istniejące trasy. Po prawej: Dla firm (/sprzedawca/dolacz), Kontakt (/legal/kontakt.html).
function SunriseArt() {
  // Oryginalna grafika: niebo o zmierzchu, tarcza słońca z poświatą i trzy plany wzgórz — lekki SVG zamiast zdjęcia.
  return <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0C0E14" /><stop offset=".25" stopColor="#1C1B22" /><stop offset=".38" stopColor="#6B3A12" /><stop offset=".46" stopColor="#D9761C" /><stop offset=".6" stopColor="#4A2C10" /></linearGradient>
      <radialGradient id="glow" cx="1080" cy="215" r="460" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#FFE3A6" stopOpacity="1" /><stop offset=".1" stopColor="#F5A623" stopOpacity=".9" /><stop offset=".4" stopColor="#E8891A" stopOpacity=".45" /><stop offset="1" stopColor="#E8891A" stopOpacity="0" /></radialGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0B0B0D" stopOpacity=".88" /><stop offset=".42" stopColor="#0B0B0D" stopOpacity=".3" /><stop offset="1" stopColor="#0B0B0D" stopOpacity="0" /></linearGradient>
      <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B0B0D" stopOpacity="0" /><stop offset="1" stopColor="#0B0B0D" stopOpacity=".55" /></linearGradient>
    </defs>
    <rect width="1440" height="520" fill="url(#sky)" />
    <circle cx="1080" cy="215" r="460" fill="url(#glow)" />
    <path d="M0 330 C120 300 220 310 330 285 C450 258 540 292 660 280 C800 266 880 262 990 275 C1100 288 1180 266 1290 272 C1360 276 1400 282 1440 278 L1440 520 L0 520 Z" fill="#241A12" />
    <path d="M0 380 C140 350 260 372 380 345 C520 314 620 352 760 342 C900 332 980 296 1100 318 C1240 344 1330 322 1440 312 L1440 520 L0 520 Z" fill="#17120C" />
    <path d="M0 440 C160 410 280 438 400 412 C540 382 640 428 780 420 C920 412 1010 380 1130 400 C1270 424 1350 402 1440 392 L1440 520 L0 520 Z" fill="#0C0A08" />
    <rect width="1440" height="520" fill="url(#fade)" />
    <rect width="1440" height="520" fill="url(#bottom)" />
    <circle cx="1080" cy="218" r="26" fill="#FFF3D0" />
  </svg>;
}

export default function Home() {
  const { rows: reco, personalized, watched, heart, rate } = useHomeFeed(8);
  const popular = usePopularCategories();
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Płać Sunrise Pay, odbieraj 3% cashbacku, kupuj z Ochroną Kupujących.", "/");

  const tiles = SECTIONS.slice(0, 5);

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader active="home" />

    <div className="mx-auto max-w-[1440px] px-6 xl:px-10">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative mt-5 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)", minHeight: 320 }}>
        <SunriseArt />
        <div className="relative flex min-h-[300px] flex-col justify-center px-10 py-12 xl:min-h-[340px] xl:px-14">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight xl:text-5xl" style={{ color: "#F5F5F7" }}>Wszystko,<br /><span style={{ color: "var(--gold)" }}>czego potrzebujesz</span><br />w jednym miejscu.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 xl:text-base" style={{ color: "rgba(245,245,247,.82)" }}>Zakupy. Rezerwacje. Nieruchomości. Motoryzacja. Usługi.<br />Sunrise Market — bliżej Twoich spraw.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/sklep" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Przeglądaj oferty</Link>
            <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-semibold backdrop-blur transition hover:opacity-90" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.25)", color: "#F5F5F7" }}>Dodaj ogłoszenie</Link>
          </div>
        </div>
        <div aria-hidden="true" className="font-display pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 -rotate-6 text-right text-2xl italic leading-tight lg:block xl:text-3xl" style={{ color: "#FFE0A8", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>Więcej możliwości<br />na każdy dzień.</div>
      </section>

      {/* ── Kafle działów ─────────────────────────────────────── */}
      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Działy">
        {tiles.map((t) => <Link key={t.title} to={t.to} className="group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]" style={tileStyle(t.tint)}>
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

      {/* ── Obszar działania OZE (SEO, 200 km) ─────────────────── */}
      <section className="mt-10" aria-labelledby="area-h">
        <div className="flex items-end justify-between gap-4">
          <div className="border-l-4 pl-4" style={{ borderColor: "var(--gold)" }}><h2 id="area-h" className="text-2xl font-bold">Fotowoltaika i pompy ciepła w Twoim mieście</h2><p className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>Marki własne Sunrise z montażem w promieniu {SERVICE_RADIUS_KM} km od Nowego Tomyśla — {SERVICE_REGIONS.join(", ")}.</p></div>
          <Link to="/oze" className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold" style={CARD}>Cały obszar ›</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{CITIES.slice(0, 16).map((c) => <Link key={c.slug} to={`/oze/${c.slug}`} className="flex h-10 items-center rounded-xl px-3 text-sm font-medium transition hover:-translate-y-0.5" style={CARD}>{c.name}</Link>)}<Link to="/oze" className="flex h-10 items-center rounded-xl px-3 text-sm font-semibold" style={{ color: "var(--gold)" }}>+{CITIES.length - 16} miast ›</Link></div>
      </section>

      {/* ── Sprzedawaj ────────────────────────────────────────── */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-8" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.16),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
        <div className="max-w-2xl"><div className="text-xl font-bold">Sprzedajesz? Wystaw ogłoszenie w kilka minut.</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>Produkt, usługa, auto albo mieszkanie — pierwszy rok bez opłat. Pieniądze zabezpiecza Ochrona Kupujących, klient płaci Sunrise Pay, kartą albo BLIK-iem i dostaje 3% cashbacku.</p></div>
        <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj ogłoszenie</Link>
      </section>
    </div>

    <HomeFooter />
  </main>;
}
