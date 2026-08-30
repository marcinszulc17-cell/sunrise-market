import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { myOffers } from "../lib/api";

type OfferType = {
  id: string;
  icon: string;
  title: string;
  description: string;
  query: string;
  mode?: "purchase" | "appointment" | "daily";
  badge?: string;
};

type OfferRow = {
  offer_id: string;
  title: string;
  price_gross: number;
  stock: number;
  status: string;
  category: string;
};

const TYPES: OfferType[] = [
  { id: "product", icon: "📦", title: "Sprzedaż produktu", description: "Klasyczna sprzedaż dowolnego produktu z koszykiem i płatnością.", query: "produkt", mode: "purchase" },
  { id: "equipment-rental", icon: "🧰", title: "Wynajem produktu / sprzętu", description: "Dowolny produkt lub sprzęt z kalendarzem od–do, ceną za dzień i płatną rezerwacją.", query: "produkt", mode: "daily", badge: "Booking" },
  { id: "equipment-slot", icon: "⏱️", title: "Rezerwacja produktu na termin", description: "Rezerwacja produktu, stanowiska lub sprzętu na konkretny dzień i godzinę.", query: "produkt", mode: "appointment", badge: "Booking" },
  { id: "service", icon: "📅", title: "Usługa z terminem", description: "Klient wybiera usługę, dzień i godzinę, a następnie płaci — jak w Booksy.", query: "usluga", mode: "appointment", badge: "Booking" },
  { id: "car-sale", icon: "🚗", title: "Sprzedaż samochodu", description: "Ogłoszenie auta z parametrami motoryzacyjnymi, cashbackiem i pełną fakturą VAT.", query: "samochod", mode: "purchase" },
  { id: "car-rental", icon: "🚘", title: "Wynajem samochodu", description: "Kalendarz od–do, cena za dzień, dostępność pojazdu i płatna rezerwacja.", query: "samochod", mode: "daily", badge: "Booking" },
  { id: "property-sale", icon: "🏠", title: "Sprzedaż nieruchomości", description: "Mieszkania, domy, działki i lokale z parametrami nieruchomości.", query: "nieruchomosc", mode: "purchase" },
  { id: "property-rental", icon: "🏡", title: "Najem / nocleg", description: "Rezerwacja nieruchomości na dni z ceną za okres, kalendarzem i płatnością.", query: "nieruchomosc", mode: "daily", badge: "Booking" },
  { id: "local", icon: "📍", title: "Ogłoszenie lokalne", description: "Proste ogłoszenie sprzedaży, oddania lub innej oferty w okolicy.", query: "lokalne", mode: "purchase" },
];

export default function SprzedawcaStart() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  useEffect(() => {
    myOffers()
      .then((rows) => setOffers((rows ?? []) as OfferRow[]))
      .catch(() => setOffers([]))
      .finally(() => setOffersLoading(false));
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Centrum sprzedawcy</h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>
              W jednym miejscu sprzedajesz produkty, wynajmujesz sprzęt i przyjmujesz płatne rezerwacje usług, aut oraz nieruchomości.
            </p>
          </div>
          <Link to="/sprzedawca/wystaw" className="rounded-2xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
            + Wystaw ofertę
          </Link>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <a href="#twoje-oferty" className="rounded-2xl p-5" style={{ background: "rgba(200,150,90,.09)", border: "1px solid rgba(200,150,90,.28)" }}>
            <div className="text-2xl">🧾</div><div className="mt-2 text-lg font-semibold">Twoje oferty</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Ogłoszenia, zdjęcia, cashback/prowizje, faktura VAT i wejście do kalendarza.</div>
          </a>
          <Link to="/sprzedawca/rezerwacje" className="rounded-2xl p-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.24)" }}>
            <div className="text-2xl">📅</div><div className="mt-2 text-lg font-semibold">Rezerwacje</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Terminy usług, auta, apartamenty, sprzęt i inne zasoby rezerwowane online.</div>
          </Link>
          <Link to="/sprzedawca/zapytania" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="text-2xl">📈</div><div className="mt-2 text-lg font-semibold">Leady i sprzedaż</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Nowe → kontakt → oferta → rezerwacja → sprzedaż deklarowana lub potwierdzona.</div>
          </Link>
        </div>

        <section id="twoje-oferty" className="mb-9 scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Twoje oferty</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Od razu przejdź do zdjęć, edycji albo ustawień bookingu konkretnego ogłoszenia.</p>
            </div>
            <Link to="/sprzedawca/oferty" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>Pełne zarządzanie ofertami →</Link>
          </div>

          {offersLoading ? (
            <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Ładowanie Twoich ofert…</div>
          ) : offers.length === 0 ? (
            <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="text-lg font-semibold">Nie masz jeszcze widocznych ofert</div>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Wystaw pierwszą ofertę. Po publikacji pojawi się tutaj i będzie można od razu dodać zdjęcia lub booking.</p>
              <Link to="/sprzedawca/wystaw" className="mt-4 inline-flex rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Wystaw ofertę</Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {offers.slice(0, 8).map((offer) => (
                <article key={offer.offer_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs" style={{ color: "var(--mut)" }}>{offer.category}</div>
                      <h3 className="mt-1 truncate text-lg font-semibold">{offer.title}</h3>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>{offer.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: "var(--mut)" }}>
                    <span><b style={{ color: "var(--ink)" }}>{Number(offer.price_gross).toLocaleString("pl-PL")} zł</b></span>
                    <span>Dostępność: {offer.stock}</span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Link to={`/sprzedawca/oferty/${offer.offer_id}/edytuj`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>✏️ Edytuj i zdjęcia</Link>
                    <Link to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>📅 Booking</Link>
                    <Link to={`/produkt/${offer.offer_id}`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Podgląd</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          {offers.length > 8 && <div className="mt-4 text-center"><Link to="/sprzedawca/oferty" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>Pokaż wszystkie {offers.length} ofert →</Link></div>}
        </section>

        <div className="mb-4">
          <h2 className="text-xl font-semibold">Co chcesz wystawić?</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Wybierz od razu sposób zakupu. Booking działa dla produktów, sprzętu, usług, aut i nieruchomości.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((type) => (
            <Link
              key={type.id}
              to={`/sprzedawca/wystaw?typ=${type.query}${type.mode ? `&mode=${type.mode}` : ""}`}
              className="group rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-4xl">{type.icon}</div>
                {type.badge && <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(56,224,240,.10)", color: "#7debf5" }}>{type.badge}</span>}
              </div>
              <h2 className="mt-5 text-xl font-semibold">{type.title}</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{type.description}</p>
              <div className="mt-5 text-sm font-semibold" style={{ color: "var(--gold)" }}>{type.mode === "appointment" || type.mode === "daily" ? "Wystaw z bookingiem →" : "Wystaw ofertę →"}</div>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link to="/sprzedawca/oferty" className="underline" style={{ color: "var(--mut)" }}>Zarządzaj ofertami</Link>
          <span style={{ color: "var(--mut)" }}>•</span>
          <Link to="/sprzedawca/rezerwacje" className="underline" style={{ color: "var(--mut)" }}>Rezerwacje</Link>
          <span style={{ color: "var(--mut)" }}>•</span>
          <Link to="/sprzedawca-klasyczny" className="underline" style={{ color: "var(--mut)" }}>Panel zaawansowany</Link>
          <span style={{ color: "var(--mut)" }}>•</span>
          <Link to="/" className="underline" style={{ color: "var(--mut)" }}>Wróć do Marketu</Link>
        </div>
      </div>
    </main>
  );
}
