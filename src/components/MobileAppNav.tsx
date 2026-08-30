import { useLocation } from "react-router-dom";

const items = [
  { href: "/", label: "Start", icon: "⌂" },
  { href: "/szukaj", label: "Szukaj", icon: "⌕" },
  { href: "/porownaj", label: "Obserwuj", icon: "♡" },
  { href: "/rezerwacje", label: "Rezerwacje", icon: "▣" },
  { href: "/konto", label: "Konto", icon: "●" },
];

export default function MobileAppNav() {
  const location = useLocation();
  if (location.pathname.startsWith('/produkt/')) return null;

  return (
    <nav className="pwa-bottom-nav" aria-label="Główna nawigacja aplikacji">
      {items.map((item) => {
        const active = item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);
        return (
          <a key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span className="pwa-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
