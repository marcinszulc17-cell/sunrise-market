// Ekran startowy mobile / app.sunrisemarket.pl (decyzja właściciela 2026-09-05: „premium marketplace”, spójny z desktopowym Home.tsx,
// ale nie kopia 1:1). Pokazywany na telefonie (≤ 640 px) i w aplikacji; duży ekran sunrisemarket.pl ma Home.tsx.
// Tylko istniejące dane i trasy: wyszukiwarka → /szukaj?q=, działy (SECTIONS), polecane (useHomeFeed: „Dla Ciebie” dla
// zalogowanych, inaczej „Polecane ogłoszenia”), popularne kategorie, rezerwacje (/szukaj?tryb=appointment, /rezerwacje),
// cashback (stawka z public_market_config), wejście dla sprzedających (/sprzedawca/wystaw).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../lib/cart";
import { useSeo } from "../lib/seo";
import NotificationsBell from "../components/NotificationsBell";
import { Ico, IconTile, SECTIONS, RecoCard, useHomeFeed, usePopularCategories, GOLD_GRAD, CARD } from "../components/home/HomeShared";

export default function Start() {
  const navigate = useNavigate();
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [q, setQ] = useState("");
  const { rows: reco, personalized, watched, heart, rate, authed } = useHomeFeed(8);
  const popular = usePopularCategories();
  useSeo("Sunrise Market — wszystko, czego potrzebujesz w jednym miejscu", "Zakupy, rezerwacje, nieruchomości, motoryzacja i usługi. Cashback 3% i Ochrona Kupujących.", "/");
  const pct = Math.round(rate * 100);

  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }

  return <main className="min-h-screen pb-24 sm:pb-8" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    {/* Niski top bar: logo, powiadomienia, koszyk, konto */}
    <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <a href="/" className="flex items-center" aria-label="Sunrise Market — strona główna"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-10 w-auto" /></a>
        <div className="flex-1" />
        <NotificationsBell />
        <Link to="/koszyk" aria-label={cartN > 0 ? `Koszyk, ${cartN} szt.` : "Koszyk"} className="icon-btn relative grid h-11 w-11 place-items-center rounded-xl" style={CARD}><Ico name="cart" size={20} />{cartN > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-black" style={{ background: "var(--gold)" }}>{cartN}</span>}</Link>
        <Link to="/konto" aria-label="Moje konto" className="grid h-11 w-11 place-items-center rounded-xl" style={CARD}><Ico name="user" size={20} /></Link>
      </div>
    </header>

    <div className="mx-auto max-w-3xl px-4">
      {/* Wyszukiwarka — pełna szerokość, 48 px */}
      <form onSubmit={submit} role="search" className="mt-4 flex items-center gap-2 rounded-2xl pl-4 pr-1.5 focus-within:shadow-[0_0_0_2px_rgba(245,166,35,.35)]" style={CARD}>
        <span style={{ color: "var(--mut)" }}><Ico name="search" size={20} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj produktów, usług, ogłoszeń…" aria-label="Szukaj" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" style={{ color: "var(--ink)" }} enterKeyHint="search" />
        <button type="submit" className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: GOLD_GRAD, color: "#101012" }} aria-label="Szukaj"><Ico name="search" size={20} strokeWidth={2.2} /></button>
      </form>
      <p className="mt-3 text-center text-[11px] font-semibold tracking-[.26em]" style={{ color: "var(--gold)" }}>KUPUJ. REZERWUJ. ZARABIAJ.</p>

      {/* Działy — 2 kolumny */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Działy">
        {SECTIONS.map((t) => <Link key={t.title} to={t.to} className="relative flex min-h-[132px] flex-col gap-3 rounded-2xl p-4 transition active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]" style={CARD}>
          <IconTile name={t.icon} tint={t.tint} size={44} />
          <div className="min-w-0"><div className="font-semibold leading-tight">{t.title}</div><div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{t.short}</div></div>
          <span aria-hidden="true" className="absolute right-4 top-4 text-lg leading-none" style={{ color: "var(--mut)" }}>›</span>
        </Link>)}
      </section>

      {/* Polecane / Dla Ciebie — kontrolowany poziomy carousel */}
      <section className="mt-7" aria-labelledby="reco-h">
        <div className="flex items-baseline justify-between gap-3"><h2 id="reco-h" className="text-lg font-semibold">{personalized ? "Dla Ciebie" : "Polecane"}</h2><Link to="/sklep" className="shrink-0 whitespace-nowrap py-2 text-sm font-semibold" style={{ color: "var(--gold)" }}>Zobacz wszystkie ›</Link></div>
        {reco === null ? <div className="-mx-4 mt-3 flex gap-3 overflow-hidden px-4">{[0, 1, 2].map((i) => <div key={i} className="aspect-[3/4] w-[46%] shrink-0 animate-pulse rounded-2xl" style={CARD} />)}</div>
        : reco.length === 0 ? <div className="mt-3 rounded-2xl p-5 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak polecanych ogłoszeń. <Link to="/sklep" style={{ color: "var(--gold)" }}>Przeglądaj katalog ›</Link></div>
        : <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0" style={{ scrollbarWidth: "none" }}>
          {reco.map((o) => <RecoCard key={o.offer_id} o={o} fav={watched.has(o.offer_id)} onFav={heart} rate={rate} compact className="w-[46%] shrink-0 snap-start sm:w-auto" />)}
        </div>}
      </section>

      {/* Popularne kategorie — tylko te z ofertami */}
      {popular.length > 0 && <section className="mt-6" aria-labelledby="pop-h">
        <h2 id="pop-h" className="text-lg font-semibold">Popularne</h2>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
          {popular.map((c) => <Link key={c.id} to={`/szukaj?kat=${encodeURIComponent(c.slug)}`} className="min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium" style={CARD}>{c.name} <span style={{ color: "var(--mut)" }}>· {c.count}</span></Link>)}
        </div>
      </section>}

      {/* Rezerwacje — istniejący flow (wyszukiwarka w trybie terminów + moje rezerwacje) */}
      <section className="mt-6 rounded-2xl p-4" style={CARD} aria-labelledby="rez-h">
        <div className="flex items-center gap-3"><IconTile name="calendar" size={44} /><div className="min-w-0"><h2 id="rez-h" className="font-semibold">Rezerwacje</h2><p className="text-xs" style={{ color: "var(--mut)" }}>Umów usługę i zapłać od razu — termin trafia do Twojego kalendarza w aplikacji.</p></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/szukaj?tryb=appointment" className="grid min-h-[44px] place-items-center rounded-xl px-3 text-sm font-semibold" style={{ background: GOLD_GRAD, color: "#101012" }}>Znajdź termin</Link>
          <Link to="/rezerwacje" className="grid min-h-[44px] place-items-center rounded-xl px-3 text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Moje rezerwacje</Link>
        </div>
      </section>

      {/* Cashback — subtelny widget, stawka z konfiguracji */}
      <section className="mt-3 flex items-center gap-3 rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.16),rgba(232,137,26,.04))", border: "1px solid rgba(232,137,26,.35)" }}>
        <IconTile name="sun" size={44} />
        <div className="min-w-0 flex-1"><div className="font-semibold">Kupuj i zyskuj cashback {pct}%</div><p className="text-xs" style={{ color: "var(--mut)" }}>Przy każdej płatności — portfelem Sunrise Pay, kartą albo BLIK-iem. Zakupy objęte Ochroną Kupujących.</p></div>
        <Link to={authed ? "/portfel" : `/login?next=${encodeURIComponent("/portfel")}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "var(--header)", border: "1px solid var(--line)" }} aria-label="Portfel Sunrise Pay">›</Link>
      </section>

      {/* Sprzedawaj — istniejący flow sprzedawcy */}
      <section className="mt-3 rounded-2xl p-4" style={CARD}>
        <div className="flex items-center gap-3"><IconTile name="plus" size={44} /><div className="min-w-0"><div className="font-semibold">Sprzedawaj na Sunrise Market</div><p className="text-xs" style={{ color: "var(--mut)" }}>Produkt, usługa, auto albo mieszkanie — pierwszy rok bez opłat.</p></div></div>
        <Link to="/sprzedawca/wystaw" className="mt-3 grid min-h-[44px] place-items-center rounded-xl text-sm font-semibold" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj ogłoszenie</Link>
      </section>

      <p className="mt-8 text-center text-[11px] tracking-[.22em]" style={{ color: "var(--mut)" }}>TWÓJ RYNEK WIĘKSZYCH MOŻLIWOŚCI</p>
    </div>
  </main>;
}
