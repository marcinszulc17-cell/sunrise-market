// Dolna nawigacja mobile/app: Start · Szukaj · Dodaj · Ulubione · Konto (istniejące trasy).
// Ikony SVG (bez emoji), cele dotyku ≥ 44 px, „Dodaj” wyróżnione złotym kółkiem. Widoczna tylko ≤ 640 px (index.css).
import { Link, useLocation } from "react-router-dom";
import { Ico, type IconName } from "./home/HomeShared";

const items: { href: string; label: string; icon: IconName; primary?: boolean; match: (p: string) => boolean }[] = [
  { href: "/", label: "Start", icon: "home", match: (p) => p === "/" },
  { href: "/szukaj", label: "Szukaj", icon: "search", match: (p) => p.startsWith("/szukaj") || p.startsWith("/sklep") },
  { href: "/sprzedawca/wystaw", label: "Dodaj", icon: "plus", primary: true, match: (p) => p.startsWith("/sprzedawca/wystaw") },
  { href: "/obserwowane", label: "Ulubione", icon: "heart", match: (p) => p.startsWith("/obserwowane") || p.startsWith("/porownaj") },
  { href: "/konto", label: "Konto", icon: "user", match: (p) => p.startsWith("/konto") || p.startsWith("/zamowienia") || p.startsWith("/portfel") },
];

export default function MobileAppNav() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/produkt/")) return null;
  return (
    <nav className="pwa-bottom-nav" aria-label="Główna nawigacja aplikacji">
      {items.map((it) => {
        const active = it.match(pathname);
        return (
          <Link key={it.href} to={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} aria-label={it.label}>
            {it.primary
              ? <span className="pwa-bottom-nav-primary" aria-hidden="true"><Ico name="plus" size={22} stroke="#101012" strokeWidth={2.4} /></span>
              : <span className="pwa-bottom-nav-icon" aria-hidden="true"><Ico name={it.icon} size={22} strokeWidth={active ? 2.2 : 1.7} /></span>}
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
