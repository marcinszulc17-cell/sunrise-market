import { Link } from "react-router-dom";

type OfferType = {
  id: string;
  icon: string;
  title: string;
  description: string;
  query: string;
  badge?: string;
};

const TYPES: OfferType[] = [
  { id: "product", icon: "📦", title: "Produkt", description: "Towary fizyczne, elektronika, dom, moda, OZE i pozostałe produkty.", query: "produkt" },
  { id: "car", icon: "🚗", title: "Samochód", description: "Dedykowany formularz motoryzacyjny: marka, model, VIN, przebieg, paliwo i wyposażenie.", query: "samochod", badge: "Nowe" },
  { id: "property", icon: "🏠", title: "Nieruchomość", description: "Mieszkania, domy, działki i lokale z powierzchnią, lokalizacją i rynkiem.", query: "nieruchomosc", badge: "Nowe" },
  { id: "service", icon: "🛠️", title: "Usługa", description: "Usługi lokalne i ogólnopolskie bez zbędnych pól magazynowych.", query: "usluga" },
  { id: "local", icon: "📍", title: "Ogłoszenie lokalne", description: "Proste ogłoszenie sprzedaży, oddania lub innej oferty w okolicy.", query: "lokalne", badge: "Nowe" },
];

export default function SprzedawcaStart() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Centrum sprzedawcy</h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>
              Wystaw ofertę albo przejdź do zapytań klientów i prowadź sprzedaż do końca.
            </p>
          </div>
          <Link to="/sprzedawca/zapytania" className="rounded-2xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
            💬 Zapytania klientów
          </Link>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <Link to="/sprzedawca/zapytania" className="rounded-2xl p-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.24)" }}>
            <div className="text-2xl">📈</div><div className="mt-2 text-lg font-semibold">Leady i sprzedaż</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Nowe → kontakt → oferta → rezerwacja → sprzedaż deklarowana lub potwierdzona.</div>
          </Link>
          <Link to="/sprzedawca-klasyczny" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="text-2xl">📣</div><div className="mt-2 text-lg font-semibold">Promowanie i zarządzanie</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Oferty, zamówienia, reklamy, statystyki, wysyłka i portfel.</div>
          </Link>
        </div>

        <h2 className="mb-4 text-xl font-semibold">Co chcesz wystawić?</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((type) => (
            <Link
              key={type.id}
              to={`/sprzedawca/wystaw?typ=${type.query}`}
              className="group rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-4xl">{type.icon}</div>
                {type.badge && <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(200,150,90,.16)", color: "var(--gold)" }}>{type.badge}</span>}
              </div>
              <h2 className="mt-5 text-xl font-semibold">{type.title}</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{type.description}</p>
              <div className="mt-5 text-sm font-semibold" style={{ color: "var(--gold)" }}>Wystaw ofertę →</div>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link to="/sprzedawca-klasyczny" className="underline" style={{ color: "var(--mut)" }}>Panel zaawansowany</Link>
          <span style={{ color: "var(--mut)" }}>•</span>
          <Link to="/" className="underline" style={{ color: "var(--mut)" }}>Wróć do Marketu</Link>
        </div>
      </div>
    </main>
  );
}
