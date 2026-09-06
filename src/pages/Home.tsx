// Strona główna na dużym ekranie sunrisemarket.pl — wg wzoru właściciela (2026-09-05): prawie czarne tło, akcent amber,
// nagłówek z centralną wyszukiwarką, pasek działów, hero z grafiką właściciela (2026-09-06: public/hero/home-hero.webp — miasto, dom,
// auto, PV, wiatrak, 6 kafli działów; tekst i przyciski nadal żywe, po lewej; gradient chroni czytelność), 6 kafli działów w rzędzie, „Polecane ogłoszenia” (4 kolumny), „Popularne kategorie”, zwięzła stopka.
// Wyłącznie warstwa UI — dane z istniejących RPC przez HomeShared; pełny katalog (filtry, banery, Strefa Energii) pod /sklep.
// Na telefonie (≤ 640 px) pokazywany jest Start.tsx. Świadomie pominięte (brak takich funkcji/stron): lokalizacja użytkownika,
// „Porady i artykuły”, „Pomoc”, „O nas”, social media, „x godz. temu” (RPC nie zwracają daty).
import { Link } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { Ico, IconTile, SECTIONS, RecoCard, HomeFooter, useHomeFeed, usePopularCategories, tileStyle, GOLD_GRAD, CARD } from "../components/home/HomeShared";
import { SiteHeader } from "../components/home/SiteChrome";
import { CITIES, SERVICE_REGIONS } from "../lib/cities";

// Pasek działów — tylko istniejące trasy. Po prawej: Dla firm (/sprzedawca/dolacz), Kontakt (/legal/kontakt.html).

export default function Home() {
  const { rows: reco, personalized, watched, heart, rate } = useHomeFeed(8);
  const popular = usePopularCategories();
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Płać Sunrise Pay, odbieraj 3% cashbacku, kupuj z Ochroną Kupujących.", "/");

  const tiles = SECTIONS; // wszystkie 6 działów — tyle samo, co w pasku działów

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader active="home" />

    <div className="mx-auto max-w-[1440px] px-6 xl:px-10">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative mt-5 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)", minHeight: 320, background: "#0b0b0d" }}>
        <picture>
          <source srcSet="/hero/home-hero.webp" type="image/webp" />
          <img src="/hero/home-hero.jpg" alt="" aria-hidden="true" fetchPriority="high" decoding="async" draggable={false} className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto max-w-none select-none" />
        </picture>
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(90deg, #0b0b0d 0%, #0b0b0d 26%, rgba(11,11,13,.86) 38%, rgba(11,11,13,.35) 50%, rgba(11,11,13,0) 62%)" }} />
        <div className="relative flex min-h-[300px] flex-col justify-center px-10 py-12 xl:min-h-[385px] xl:px-14">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight xl:text-5xl" style={{ color: "#F5F5F7" }}>Wszystko,<br /><span style={{ color: "var(--gold)" }}>czego potrzebujesz</span><br />w jednym miejscu.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 xl:text-base" style={{ color: "rgba(245,245,247,.82)" }}>Zakupy. Rezerwacje. Nieruchomości. Motoryzacja. Usługi.<br />Sunrise Market — bliżej Twoich spraw.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/sklep" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Przeglądaj oferty</Link>
            <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-semibold backdrop-blur transition hover:opacity-90" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.25)", color: "#F5F5F7" }}>Dodaj ogłoszenie</Link>
          </div>
        </div>
      </section>

      {/* ── Kafle działów ─────────────────────────────────────── */}
      <section className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Działy">
        {tiles.map((t) => <Link key={t.title} to={t.to} className="group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]" style={tileStyle(t.tint)}>
          <IconTile name={t.icon} tint={t.tint} size={46} />
          <div className="min-w-0 flex-1"><div className="whitespace-nowrap font-bold">{t.title}</div><div className="mt-0.5 line-clamp-2 text-xs leading-4" style={{ color: "var(--mut)" }}>{t.desc}</div></div>
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

      {/* ── Obszar działania (SEO): cała Polska ─────────── */}
      <section className="mt-10" aria-labelledby="area-h">
        <div className="flex items-end justify-between gap-4">
          <div className="border-l-4 pl-4" style={{ borderColor: "var(--gold)" }}><h2 id="area-h" className="text-2xl font-bold">Sunrise Market w Twoim mieście</h2><p className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>Ogłoszenia lokalnych sprzedawców i firm w całej Polsce, a do tego fotowoltaika i pompy ciepła marek własnych Sunrise z montażem w całej Polsce — {CITIES.length} miast, {SERVICE_REGIONS.length} województw.</p></div>
          <Link to="/miasto" className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold" style={CARD}>Wszystkie miasta ›</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{CITIES.slice(0, 24).map((c) => <Link key={c.slug} to={`/miasto/${c.slug}`} className="flex h-10 items-center rounded-xl px-3 text-sm font-medium transition hover:-translate-y-0.5" style={CARD}>{c.name}</Link>)}<Link to="/miasto" className="flex h-10 items-center rounded-xl px-3 text-sm font-semibold" style={{ color: "var(--gold)" }}>+{CITIES.length - 24} miast ›</Link></div>
      </section>

      {/* ── Sprzedawaj ────────────────────────────────────────── */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-8" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.16),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
        <div className="max-w-2xl"><div className="text-xl font-bold">Sprzedajesz? Wystaw ogłoszenie w kilka minut.</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>Produkt, usługa, auto albo mieszkanie — pierwszy rok bez opłat. Pieniądze zabezpiecza Ochrona Kupujących, klient płaci Sunrise Pay albo kartą i dostaje 3% cashbacku.</p></div>
        <Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-6 text-sm font-bold shadow-[0_8px_24px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj ogłoszenie</Link>
      </section>
    </div>

    <HomeFooter />
  </main>;
}
