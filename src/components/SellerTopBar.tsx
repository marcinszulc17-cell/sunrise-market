import { Link, useLocation } from "react-router-dom";

// Pasek nawigacji dla całego centrum sprzedawcy (/sprzedawca*).
// Powód: strony sprzedawcy są osobnymi ekranami bez nagłówka sklepu — użytkownik
// nie miał żadnej drogi powrotu do sklepu ani między sekcjami (zgłoszenie właściciela 2026-09-05).
const SECTIONS: { href: string; label: string }[] = [
  { href: "/sprzedawca", label: "Centrum" },
  { href: "/sprzedawca/oferty", label: "Oferty" },
  { href: "/sprzedawca/zamowienia", label: "Zamówienia" },
  { href: "/sprzedawca/rezerwacje", label: "Rezerwacje" },
  { href: "/sprzedawca/rozliczenia", label: "Rozliczenia" },
  { href: "/sprzedawca/zapytania", label: "Zapytania" },
];

export default function SellerTopBar() {
  const { pathname } = useLocation();
  const isActive = (href: string) => href === "/sprzedawca" ? pathname === "/sprzedawca" : pathname.startsWith(href);
  return (
    <header className="sticky top-0 z-40 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ border: "1px solid var(--line)", color: "var(--ink)" }} title="Wróć do sklepu">
          <span aria-hidden="true">←</span> Sklep
        </Link>
        <Link to="/" className="hidden shrink-0 sm:block" aria-label="Sunrise Market — strona główna">
          <img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" />
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm" aria-label="Sekcje centrum sprzedawcy">
          {SECTIONS.map((s) => (
            <Link key={s.href} to={s.href} className="shrink-0 rounded-lg px-3 py-1.5" aria-current={isActive(s.href) ? "page" : undefined}
              style={isActive(s.href) ? { background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#000", fontWeight: 600 } : { color: "var(--mut)" }}>
              {s.label}
            </Link>
          ))}
        </nav>
        <Link to="/konto" className="shrink-0 rounded-xl px-3 py-1.5 text-sm" style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>Konto</Link>
      </div>
    </header>
  );
}
