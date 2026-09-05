import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { myOffers, sellerOrders } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Offer = { offer_id: string; status: string };
type Order = { order_id: string; my_total: number; invoice?: { requested?: boolean } | null };
type BookingHealth = { active: boolean; active_bookings: number; booking_type: string | null };

export default function SellerBusinessDashboard() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bookingRows, setBookingRows] = useState<BookingHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [offerRows, orderRows, booking] = await Promise.all([
          myOffers(),
          sellerOrders(),
          supabase.schema("market").rpc("seller_booking_health_bulk"),
        ]);
        setOffers((offerRows ?? []) as Offer[]);
        setOrders((orderRows ?? []) as Order[]);
        if (!booking.error) setBookingRows((booking.data ?? []) as BookingHealth[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => ({
    activeOffers: offers.filter((o) => o.status === "active").length,
    hiddenOffers: offers.filter((o) => o.status === "paused").length,
    orders: orders.length,
    invoiceRequests: orders.filter((o) => o.invoice?.requested).length,
    revenue: orders.reduce((sum, o) => sum + Number(o.my_total || 0), 0),
    activeBookings: bookingRows.reduce((sum, b) => sum + Number(b.active_bookings || 0), 0),
  }), [offers, orders, bookingRows]);

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-6xl">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Centrum sprzedawcy</h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>Twoje oferty, zamówienia, rezerwacje i rozliczenia w jednym miejscu.</p>
        </div>
        <Link to="/sprzedawca/wystaw" className="rounded-2xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>+ Wystaw ofertę</Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aktywne oferty" value={loading ? "…" : String(stats.activeOffers)} />
        <Stat label="Ukryte oferty" value={loading ? "…" : String(stats.hiddenOffers)} />
        <Stat label="Zamówienia" value={loading ? "…" : String(stats.orders)} />
        <Stat label="Aktywne rezerwacje" value={loading ? "…" : String(stats.activeBookings)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Module to="/sprzedawca/oferty" icon="📦" title="Oferty" description="Edycja ofert, zdjęcia, ceny, VAT, ukrywanie i pokazywanie ofert, archiwum oraz ustawienia rezerwacji." meta={loading ? "Ładowanie…" : `${stats.activeOffers} aktywnych · ${stats.hiddenOffers} ukrytych`} primary="Zarządzaj ofertami" />
        <Module to="/sprzedawca/zamowienia" icon="🛍️" title="Zamówienia" description="Opłacone zamówienia, wysyłka i realizacja sprzedaży. Przy każdym zamówieniu znajdziesz dane nabywcy do faktury." meta={loading ? "Ładowanie…" : `${stats.orders} zamówień · ${stats.invoiceRequests} próśb o fakturę`} primary="Otwórz zamówienia" />
        <Module to="/sprzedawca/rezerwacje" icon="📅" title="Rezerwacje" description="Kalendarz, dzisiejsze i nadchodzące terminy, blokady, pracownicy, auta, nieruchomości i inne zasoby." meta={loading ? "Ładowanie…" : `${stats.activeBookings} aktywnych rezerwacji`} primary="Otwórz rezerwacje" />
        <Module to="/sprzedawca/rozliczenia" icon="💳" title="Rozliczenia" description="Wpływy ze sprzedaży, wypłaty na portfel Sunrise Pay i historia rozliczeń." meta={loading ? "Ładowanie…" : `Wpływy z zamówień: ${zl(stats.revenue)}`} primary="Otwórz rozliczenia" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/sprzedawca/zapytania" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">📈 Leady i sprzedaż</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Zapytania przed zakupem i proces handlowy.</div></Link>
        <Link to="/sprzedawca/odbior" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">🏪 Odbiór i kontakt</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Włącz punkt odbioru — klient płaci w aplikacji, odbiera u Ciebie, bez kosztów wysyłki.</div></Link>
        <Link to="/sprzedawca/opinie" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">⭐ Opinie kupujących</div><div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Oceny z opłaconych zamówień, publiczne odpowiedzi i Twój profil sprzedawcy.</div></Link>
        <div className="rounded-2xl p-5" style={{ background: "rgba(232,137,26,.07)", border: "1px solid rgba(232,137,26,.24)" }}><div className="font-semibold">🧾 Faktury sprzedawcy</div><div className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>Dane nabywcy do faktury znajdziesz przy każdym zamówieniu. Fakturę wystawiasz w swoim programie i możesz dołączyć ją bezpośrednio do zamówienia.</div></div>
      </div>
    </div>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}

function Module({ to, icon, title, description, meta, primary }: { to: string; icon: string; title: string; description: string; meta: string; primary: string }) {
  return <Link to={to} className="rounded-3xl p-6 transition hover:-translate-y-0.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-3xl">{icon}</div><h2 className="mt-3 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{description}</p><div className="mt-4 text-xs" style={{ color: "var(--gold)" }}>{meta}</div><div className="mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>{primary} →</div></Link>;
}
