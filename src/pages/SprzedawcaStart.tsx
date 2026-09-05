import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { myOffers } from "../lib/api";
import { supabase } from "../lib/supabase";

type OfferType = {
  id: string;
  icon: string;
  title: string;
  description: string;
  mode: "purchase" | "appointment" | "daily";
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

type BookingHealthRow = {
  offer_id: string;
  booking_type: "appointment" | "daily" | null;
  active: boolean;
  availability_count: number;
  bookings: number;
  active_bookings: number;
};
type BookingHealth = {
  kind: "none" | "setup" | "no_availability" | "active" | "booked";
  label: string;
  bookingType?: "appointment" | "daily";
  bookings: number;
  activeBookings: number;
};

const TYPES: OfferType[] = [
  { id: "sale", icon: "🛍️", title: "Sprzedaż", description: "Sprzedaj produkt, samochód, nieruchomość lub dowolny inny przedmiot. Kategorię i parametry wybierzesz w następnym kroku.", mode: "purchase" },
  { id: "appointment", icon: "📅", title: "Usługa na termin", description: "Klient wybiera usługę, dzień i godzinę, a następnie płaci online — jak w Booksy.", mode: "appointment", badge: "Booking" },
  { id: "rental", icon: "🔑", title: "Wynajem", description: "Wynajmij samochód, nieruchomość, sprzęt lub inny zasób z kalendarzem od–do i płatnością online.", mode: "daily", badge: "Booking" },
];

function healthStyle(kind: BookingHealth["kind"]): React.CSSProperties {
  if (kind === "booked") return { background: "rgba(56,224,240,.10)", color: "#7debf5", border: "1px solid rgba(56,224,240,.24)" };
  if (kind === "active") return { background: "rgba(34,197,94,.10)", color: "var(--green)", border: "1px solid rgba(34,197,94,.24)" };
  if (kind === "setup") return { background: "rgba(232,137,26,.12)", color: "var(--gold)", border: "1px solid rgba(232,137,26,.28)" };
  if (kind === "no_availability") return { background: "rgba(239,68,68,.10)", color: "#fca5a5", border: "1px solid rgba(239,68,68,.25)" };
  return { background: "var(--header)", color: "var(--mut)", border: "1px solid var(--line)" };
}

function bookingHealth(row?: BookingHealthRow): BookingHealth {
  if (!row?.booking_type) return { kind: "none", label: "Bez bookingu", bookings: 0, activeBookings: 0 };
  const bookings = Number(row.bookings || 0);
  const activeBookings = Number(row.active_bookings || 0);
  const bookingType = row.booking_type;
  if (bookings > 0) return { kind: "booked", label: activeBookings > 0 ? `Ma rezerwacje · ${activeBookings} aktywne` : `Historia rezerwacji · ${bookings}`, bookingType, bookings, activeBookings };
  if (!row.active) return { kind: "setup", label: "Do konfiguracji", bookingType, bookings: 0, activeBookings: 0 };
  if (bookingType === "appointment" && Number(row.availability_count || 0) === 0) return { kind: "no_availability", label: "Brak dostępności", bookingType, bookings: 0, activeBookings: 0 };
  return { kind: "active", label: "Booking aktywny", bookingType, bookings: 0, activeBookings: 0 };
}

export default function SprzedawcaStart() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [health, setHealth] = useState<Record<string, BookingHealth>>({});

  useEffect(() => {
    async function load() {
      setOffersLoading(true);
      try {
        const [offerRows, healthResult] = await Promise.all([
          myOffers(),
          supabase.schema("market").rpc("seller_booking_health_bulk"),
        ]);
        const rows = (offerRows ?? []) as OfferRow[];
        setOffers(rows);
        const healthRows = (healthResult.error ? [] : (healthResult.data ?? [])) as BookingHealthRow[];
        const byOffer = new Map(healthRows.map((row) => [row.offer_id, row]));
        setHealth(Object.fromEntries(rows.map((offer) => [offer.offer_id, bookingHealth(byOffer.get(offer.offer_id))])));
      } catch {
        setOffers([]);
        setHealth({});
      } finally {
        setOffersLoading(false);
      }
    }
    load();
  }, []);

  const bookingStats = useMemo(() => {
    const values = Object.values(health);
    return {
      active: values.filter(x => x.kind === "active" || x.kind === "booked").length,
      attention: values.filter(x => x.kind === "setup" || x.kind === "no_availability").length,
      reservations: values.reduce((sum, x) => sum + x.activeBookings, 0),
    };
  }, [health]);

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
          <Link to="/sprzedawca/wystaw" className="rounded-2xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>
            + Wystaw ofertę
          </Link>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a href="#twoje-oferty" className="rounded-2xl p-5" style={{ background: "rgba(232,137,26,.09)", border: "1px solid rgba(232,137,26,.28)" }}>
            <div className="text-2xl">🧾</div><div className="mt-2 text-lg font-semibold">Twoje oferty</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Ogłoszenia, zdjęcia, cashback/prowizje, faktura VAT i wejście do kalendarza.</div>
          </a>
          <Link to="/sprzedawca/zamowienia" className="rounded-2xl p-5" style={{ background: "rgba(232,137,26,.07)", border: "1px solid rgba(232,137,26,.24)" }}>
            <div className="text-2xl">💳</div><div className="mt-2 text-lg font-semibold">Zamówienia i faktury</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Opłacone zakupy, Twoje wpływy oraz zamrożone dane firmy i NIP do faktury.</div>
          </Link>
          <Link to="/sprzedawca/rezerwacje" className="rounded-2xl p-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.24)" }}>
            <div className="text-2xl">📅</div><div className="mt-2 text-lg font-semibold">Rezerwacje</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Terminy usług, auta, apartamenty, sprzęt i inne zasoby rezerwowane online.</div>
          </Link>
          <Link to="/sprzedawca/zapytania" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="text-2xl">📈</div><div className="mt-2 text-lg font-semibold">Leady i sprzedaż</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Nowe → kontakt → oferta → rezerwacja → sprzedaż deklarowana lub potwierdzona.</div>
          </Link>
        </div>

        {!offersLoading && (bookingStats.active > 0 || bookingStats.attention > 0 || bookingStats.reservations > 0) && (
          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <Link to="/sprzedawca/rezerwacje" className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>Booking aktywny</div><div className="mt-1 text-2xl font-semibold">{bookingStats.active}</div></Link>
            <a href="#twoje-oferty" className="rounded-2xl p-4" style={bookingStats.attention > 0 ? { background: "rgba(232,137,26,.10)", border: "1px solid rgba(232,137,26,.28)" } : { background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>Wymaga ustawienia</div><div className="mt-1 text-2xl font-semibold">{bookingStats.attention}</div></a>
            <Link to="/sprzedawca/rezerwacje" className="rounded-2xl p-4" style={{ background: "rgba(56,224,240,.07)", border: "1px solid rgba(56,224,240,.18)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>Aktywne rezerwacje klientów</div><div className="mt-1 text-2xl font-semibold">{bookingStats.reservations}</div></Link>
          </div>
        )}

        <section id="twoje-oferty" className="mb-9 scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Twoje oferty</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Status bookingu od razu pokaże, które ogłoszenie jest gotowe, ma rezerwacje albo wymaga uzupełnienia.</p>
            </div>
            <Link to="/sprzedawca/oferty" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>Pełne zarządzanie ofertami →</Link>
          </div>

          {offersLoading ? (
            <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Ładowanie Twoich ofert i statusów bookingu…</div>
          ) : offers.length === 0 ? (
            <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="text-lg font-semibold">Nie masz jeszcze widocznych ofert</div>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Wystaw pierwszą ofertę. Po publikacji pojawi się tutaj i będzie można od razu dodać zdjęcia lub booking.</p>
              <Link to="/sprzedawca/wystaw" className="mt-4 inline-flex rounded-xl px-4 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>+ Wystaw ofertę</Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {offers.slice(0, 8).map((offer) => {
                const booking = health[offer.offer_id] ?? { kind: "none", label: "Bez bookingu", bookings: 0, activeBookings: 0 } as BookingHealth;
                const needsAttention = booking.kind === "setup" || booking.kind === "no_availability";
                return <article key={offer.offer_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: needsAttention ? "1px solid rgba(232,137,26,.38)" : "1px solid var(--line)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs" style={{ color: "var(--mut)" }}>{offer.category}</div>
                      <h3 className="mt-1 truncate text-lg font-semibold">{offer.title}</h3>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>{offer.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={healthStyle(booking.kind)}>📅 {booking.label}</span>
                    {booking.bookingType && <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--mut)" }}>{booking.bookingType === "daily" ? "Wynajem na dni" : "Termin / godzina"}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: "var(--mut)" }}>
                    <span><b style={{ color: "var(--ink)" }}>{Number(offer.price_gross).toLocaleString("pl-PL")} zł</b></span>
                    <span>Dostępność: {offer.stock}</span>
                    {booking.bookings > 0 && <span>Rezerwacje: {booking.bookings}</span>}
                  </div>
                  {needsAttention && <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(232,137,26,.08)", color: "var(--mut)" }}>{booking.kind === "setup" ? "Dokończ konfigurację i aktywuj kalendarz, aby klienci mogli rezerwować." : "Booking jest włączony, ale nie ma godzin dostępności. Uzupełnij kalendarz."}</div>}
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Link to={`/sprzedawca/oferty/${offer.offer_id}/edytuj`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>✏️ Edytuj i zdjęcia</Link>
                    <Link to={`/sprzedawca/rezerwacje/ustawienia/${offer.offer_id}`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ border: needsAttention ? "1px solid var(--gold)" : "1px solid var(--line)", color: needsAttention ? "var(--gold)" : "var(--ink)" }}>{needsAttention ? "⚠️ Ustaw booking" : "📅 Booking"}</Link>
                    <Link to={`/produkt/${offer.offer_id}`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Podgląd</Link>
                  </div>
                </article>;
              })}
            </div>
          )}
          {offers.length > 8 && <div className="mt-4 text-center"><Link to="/sprzedawca/oferty" className="text-sm font-semibold underline" style={{ color: "var(--gold)" }}>Pokaż wszystkie {offers.length} ofert →</Link></div>}
        </section>

        <div className="mb-4">
          <h2 className="text-xl font-semibold">Co chcesz wystawić?</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Najpierw wybierz model oferty. Kategorię — np. auto, nieruchomość, sprzęt albo konkretną usługę — wybierzesz w uniwersalnym kreatorze.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((type) => (
            <Link key={type.id} to={`/sprzedawca/wystaw?mode=${type.mode}`} className="group rounded-2xl p-5 transition-transform hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="flex items-start justify-between gap-3"><div className="text-4xl">{type.icon}</div>{type.badge && <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(56,224,240,.10)", color: "#7debf5" }}>{type.badge}</span>}</div>
              <h2 className="mt-5 text-xl font-semibold">{type.title}</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{type.description}</p>
              <div className="mt-5 text-sm font-semibold" style={{ color: "var(--gold)" }}>{type.mode === "purchase" ? "Wystaw ofertę →" : "Wystaw z bookingiem →"}</div>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link to="/sprzedawca/oferty" className="underline" style={{ color: "var(--mut)" }}>Zarządzaj ofertami</Link><span style={{ color: "var(--mut)" }}>•</span><Link to="/sprzedawca/zamowienia" className="underline" style={{ color: "var(--mut)" }}>Zamówienia i faktury</Link><span style={{ color: "var(--mut)" }}>•</span><Link to="/sprzedawca/rezerwacje" className="underline" style={{ color: "var(--mut)" }}>Rezerwacje</Link><span style={{ color: "var(--mut)" }}>•</span><Link to="/sprzedawca-klasyczny" className="underline" style={{ color: "var(--mut)" }}>Panel zaawansowany</Link><span style={{ color: "var(--mut)" }}>•</span><Link to="/" className="underline" style={{ color: "var(--mut)" }}>Wróć do Marketu</Link>
        </div>
      </div>
    </main>
  );
}