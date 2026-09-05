// Wspólna „rama” strony (wg wzoru właściciela 2026-09-05): nagłówek z wyszukiwarką i paskiem działów na dużym ekranie,
// niski pasek (logo · dzwonek · koszyk · konto) na telefonie, okruszki, tytuły sekcji z pomarańczową belką, stopka.
// Tylko istniejące trasy — bez lokalizacji, „Porad i artykułów” i social (takich stron nie ma).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ThemeToggle from "../ThemeToggle";
import NotificationsBell from "../NotificationsBell";
import { useCart } from "../../lib/cart";
import { Ico, GOLD_GRAD, CARD } from "./HomeShared";

export const MENU: { to: string; label: string; key: string }[] = [
  { to: "/", label: "Strona główna", key: "home" },
  { to: "/sklep", label: "Zakupy", key: "shop" },
  { to: "/szukaj?tryb=appointment", label: "Rezerwacje", key: "booking" },
  { to: "/nieruchomosci", label: "Nieruchomości", key: "property" },
  { to: "/motoryzacja", label: "Motoryzacja", key: "car" },
  { to: "/szukaj?kat=uslugi-i-reklama", label: "Usługi", key: "services" },
  { to: "/szukaj?kat=oze-i-energia", label: "OZE i Energia", key: "energy" },
];

const navBtn = "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]";

/** Nagłówek serwisu. `active` = klucz pozycji paska działów do podświetlenia. */
export function SiteHeader({ active, compact = false }: { active?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [q, setQ] = useState("");
  function submit(e: React.FormEvent) { e.preventDefault(); navigate(q.trim() ? `/szukaj?q=${encodeURIComponent(q.trim())}` : "/szukaj"); }
  const badge = cartN > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: "var(--gold)", color: "#101012" }}>{cartN}</span>;

  return <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
    {/* Telefon: niski pasek */}
    <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 sm:hidden">
      <a href="/" className="flex items-center" aria-label="Sunrise Market — strona główna"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-10 w-auto" /></a>
      <div className="flex-1" />
      <NotificationsBell />
      <Link to="/koszyk" aria-label={cartN > 0 ? `Koszyk, ${cartN} szt.` : "Koszyk"} className="icon-btn relative grid h-11 w-11 place-items-center rounded-xl" style={CARD}><Ico name="cart" size={20} />{badge}</Link>
      <Link to="/konto" aria-label="Moje konto" className="grid h-11 w-11 place-items-center rounded-xl" style={CARD}><Ico name="user" size={20} /></Link>
    </div>
    {/* Duży ekran */}
    <div className="mx-auto hidden max-w-[1440px] flex-wrap items-center gap-3 px-6 py-3 sm:flex lg:flex-nowrap lg:gap-5 xl:px-10">
      <a href="/" className="flex shrink-0 items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-12 w-auto" /></a>
      <form onSubmit={submit} role="search" className="order-last flex w-full max-w-2xl basis-full items-center overflow-hidden rounded-xl lg:order-none lg:mx-auto lg:basis-auto" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)" }}>
        <span className="pl-4" style={{ color: "var(--mut)" }}><Ico name="search" size={20} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj produktów, usług, ogłoszeń…" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" style={{ color: "var(--ink)" }} aria-label="Szukaj" />
        <button type="submit" className="h-11 shrink-0 px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Szukaj</button>
      </form>
      <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label="Konto">
        <ThemeToggle />
        <NotificationsBell />
        <Link to="/koszyk" aria-label={cartN > 0 ? `Koszyk, ${cartN} szt.` : "Koszyk"} className={`icon-btn relative ${navBtn}`}><Ico name="cart" size={20} />{badge}</Link>
        <Link to="/konto" className={navBtn}><Ico name="user" size={20} /><span className="hidden xl:inline">Moje konto</span></Link>
        <Link to="/obserwowane" className={navBtn}><Ico name="heart" size={20} /><span className="hidden xl:inline">Ulubione</span></Link>
        <Link to="/sprzedawca/wystaw" className="ml-2 flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold shadow-[0_6px_20px_rgba(232,137,26,.3)] transition hover:brightness-105" style={{ background: GOLD_GRAD, color: "#101012" }}><span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: "rgba(0,0,0,.2)" }}><Ico name="plus" size={12} strokeWidth={2.6} /></span><span className="hidden md:inline">Dodaj ogłoszenie</span><span className="md:hidden">Dodaj</span></Link>
      </nav>
    </div>
    {!compact && <div className="hidden sm:block" style={{ borderTop: "1px solid var(--line)", background: "rgba(255,255,255,.03)" }}><div className="mx-auto flex max-w-[1440px] items-center px-6 xl:px-10">
      <nav className="flex items-center gap-1 overflow-x-auto text-sm" aria-label="Działy" style={{ scrollbarWidth: "none" }}>
        {MENU.map((m) => { const on = m.key === active; return <Link key={m.key} to={m.to} aria-current={on ? "page" : undefined} className="flex h-11 items-center gap-1.5 whitespace-nowrap px-3 font-medium transition hover:text-[var(--ink)]" style={{ color: on ? "var(--gold)" : "var(--mut)", boxShadow: on ? "inset 0 -2px 0 var(--gold)" : "none" }}>{m.key === "home" && <Ico name="home" size={16} />}{m.label}</Link>; })}
      </nav>
      <nav className="ml-auto hidden items-center gap-1 text-sm lg:flex" aria-label="Więcej">
        <Link to="/pomoc" className="flex h-11 items-center px-3 font-medium navlink">Pomoc</Link>
        <Link to="/sprzedawca/dolacz" className="flex h-11 items-center px-3 font-medium navlink">Dla firm</Link>
        <a href="/legal/kontakt.html" className="flex h-11 items-center px-3 font-medium navlink">Kontakt</a>
      </nav>
    </div></div>}
  </header>;
}

/** Okruszki: [{label, to?}] — ostatni element bez linku. */
export function Breadcrumbs({ items, back }: { items: { label: string; to?: string }[]; back?: string }) {
  return <nav aria-label="Okruszki" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: "var(--mut)" }}>
    {back && <Link to={back} className="mr-2 flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold" style={CARD}>← Wróć</Link>}
    {items.map((it, i) => <span key={i} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true">›</span>}{it.to ? <Link to={it.to} className="navlink">{it.label}</Link> : <span style={{ color: "var(--ink)" }}>{it.label}</span>}</span>)}
  </nav>;
}

/** Tytuł sekcji z pomarańczową belką (wg wzoru). */
export function SectionTitle({ children, sub, action, as: Tag = "h2", className = "" }: { children: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; as?: "h1" | "h2" | "h3"; className?: string }) {
  return <div className={`flex items-end justify-between gap-4 ${className}`}>
    <div className="border-l-4 pl-4" style={{ borderColor: "var(--gold)" }}><Tag className={Tag === "h1" ? "text-3xl font-bold" : "text-xl font-bold sm:text-2xl"}>{children}</Tag>{sub && <p className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>{sub}</p>}</div>
    {action}
  </div>;
}

/** Pionowe menu boczne (Moje konto / Panel sprzedawcy). */
export function SideNav({ items, current }: { items: { to: string; label: string; icon: React.ReactNode; badge?: number | string }[]; current: string }) {
  return <nav className="grid gap-1" aria-label="Sekcje">
    {items.map((it) => { const on = it.to === current; return <Link key={it.to} to={it.to} aria-current={on ? "page" : undefined} className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition hover:bg-white/5" style={on ? { background: "rgba(245,166,35,.12)", color: "var(--gold)", boxShadow: "inset 3px 0 0 var(--gold)" } : { color: "var(--ink)" }}><span className="grid w-5 place-items-center" style={{ color: on ? "var(--gold)" : "var(--mut)" }}>{it.icon}</span>{it.label}{it.badge !== undefined && it.badge !== 0 && <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(255,255,255,.08)" }}>{it.badge}</span>}</Link>; })}
  </nav>;
}
