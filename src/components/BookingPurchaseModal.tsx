import { useEffect, useMemo, useState } from "react";
import {
  bookingAvailableSlots,
  checkoutBooking,
  createBookingHold,
  type BookingConfig,
  type BookingSlot,
} from "../lib/api";
import { zl } from "../lib/money";

type Props = { offerId: string; config: BookingConfig; open: boolean; onClose: () => void };
const dayKey = (value: string | Date, timezone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const dayLabel = (iso: string, timezone: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
const hourLabel = (iso: string, timezone: string) => new Date(iso).toLocaleTimeString("pl-PL", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
const dateAtNoonUtc = (value: string) => new Date(`${value}T12:00:00Z`);

export default function BookingPurchaseModal({ offerId, config, open, onClose }: Props) {
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selected, setSelected] = useState<BookingSlot | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [payment, setPayment] = useState<"wallet" | "card">("wallet");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || config.booking_type !== "appointment") return;
    setLoading(true); setError(null); setSelected(null);
    const from = new Date();
    const to = new Date(from.getTime() + Math.min(config.max_advance_days, 30) * 86400000);
    bookingAvailableSlots(offerId, from, to).then((rows) => {
      setSlots(rows);
      setSelectedDay(rows[0] ? dayKey(rows[0].starts_at, config.timezone) : "");
    }).catch((e) => setError(e?.message || "Nie udało się pobrać terminów")).finally(() => setLoading(false));
  }, [open, offerId, config.booking_type, config.max_advance_days]);

  const days = useMemo(() => Array.from(new Map(slots.map((s) => [dayKey(s.starts_at, config.timezone), s.starts_at])).entries()), [slots, config.timezone]);
  const visibleSlots = slots.filter((s) => dayKey(s.starts_at, config.timezone) === selectedDay);
  const rentalUnits = fromDay && toDay ? Math.max(0, Math.round((dateAtNoonUtc(toDay).getTime() - dateAtNoonUtc(fromDay).getTime()) / 86400000)) : 0;
  const rentalTotal = rentalUnits * Number(config.price_per_unit);
  const today = dayKey(new Date(Date.now() + config.min_notice_hours * 3600000), config.timezone);
  const latest = dayKey(new Date(Date.now() + config.max_advance_days * 86400000), config.timezone);

  async function pay() {
    setBusy(true); setError(null);
    try {
      let hold;
      if (config.booking_type === "appointment") {
        if (!selected) throw new Error("Wybierz dostępny termin");
        hold = await createBookingHold(offerId, new Date(selected.starts_at), new Date(selected.ends_at));
      } else {
        if (!fromDay || !toDay || rentalUnits < 1) throw new Error("Wybierz prawidłowy okres rezerwacji");
        if (rentalUnits > config.max_units) throw new Error(`Maksymalny okres to ${config.max_units} dni`);
        hold = await createBookingHold(offerId, dateAtNoonUtc(fromDay), dateAtNoonUtc(toDay));
      }
      const result = await checkoutBooking(hold.booking_id, payment);
      if (result.url) { window.location.href = result.url; return; }
      window.location.href = `/rezerwacje?paid=success&booking=${hold.booking_id}&order=${result.order_id}`;
    } catch (e: any) {
      const message = e?.message || "Nie udało się opłacić rezerwacji";
      if (message.toLowerCase().includes("zaloguj") || message.toLowerCase().includes("autoryz")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setError(message);
    } finally { setBusy(false); }
  }

  if (!open) return null;
  const total = config.booking_type === "appointment" ? Number(selected?.amount_gross ?? config.price_per_unit) : rentalTotal;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 sm:p-7" onMouseDown={(e) => e.stopPropagation()} style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h2 className="font-display text-2xl font-semibold">{config.booking_type === "appointment" ? "Wybierz termin usługi" : "Wybierz okres rezerwacji"}</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Termin blokujemy na czas bezpiecznej płatności.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1" aria-label="Zamknij">✕</button>
      </div>

      {config.booking_type === "appointment" ? <>
        {loading && <p style={{ color: "var(--mut)" }}>Pobieram dostępne terminy…</p>}
        {!loading && days.length === 0 && <p className="rounded-xl p-4" style={{ background: "var(--glass)", color: "var(--mut)" }}>Brak wolnych terminów w najbliższych 30 dniach.</p>}
        {days.length > 0 && <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">{days.map(([key, iso]) => <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelected(null); }} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: selectedDay === key ? "var(--gold)" : "var(--glass)", color: selectedDay === key ? "#211406" : "var(--ink)", border: "1px solid var(--line)" }}>{dayLabel(iso, config.timezone)}</button>)}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{visibleSlots.map((slot) => <button key={slot.starts_at} type="button" onClick={() => setSelected(slot)} className="rounded-xl py-2 text-sm font-semibold" style={{ background: selected?.starts_at === slot.starts_at ? "rgba(34,197,94,.2)" : "var(--glass)", border: selected?.starts_at === slot.starts_at ? "1px solid var(--green)" : "1px solid var(--line)" }}>{hourLabel(slot.starts_at, config.timezone)}</button>)}</div>
        </>}
      </> : <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Od<input type="date" min={today} max={latest} value={fromDay} onChange={(e) => { setFromDay(e.target.value); if (toDay && e.target.value >= toDay) setToDay(""); }} className="mt-1 w-full rounded-xl px-3 py-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></label>
        <label className="text-sm">Do<input type="date" min={fromDay || today} max={latest} value={toDay} onChange={(e) => setToDay(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></label>
        {rentalUnits > 0 && <p className="sm:col-span-2 text-sm" style={{ color: "var(--mut)" }}>{rentalUnits} {rentalUnits === 1 ? "dzień" : "dni"} × {zl(config.price_per_unit)}</p>}
      </div>}

      <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="mb-3 flex items-center justify-between"><span>Do zapłaty</span><strong className="text-xl" style={{ color: "var(--gold)" }}>{zl(total)}</strong></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setPayment("wallet")} className="rounded-xl p-3 text-left" style={{ border: payment === "wallet" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "wallet" ? "rgba(200,150,90,.12)" : "transparent" }}><b>Sunrise Pay</b><div className="text-xs" style={{ color: "var(--mut)" }}>Portfel MySunrise</div></button>
          <button type="button" onClick={() => setPayment("card")} className="rounded-xl p-3 text-left" style={{ border: payment === "card" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "card" ? "rgba(200,150,90,.12)" : "transparent" }}><b>Karta / BLIK / P24</b><div className="text-xs" style={{ color: "var(--mut)" }}>Bezpieczna płatność Stripe</div></button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,.12)", color: "#fca5a5" }}>{error}</p>}
      <button type="button" disabled={busy || total <= 0 || (config.booking_type === "appointment" && !selected)} onClick={pay} className="mt-4 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Rezerwuję i przekierowuję…" : `Rezerwuję i płacę ${zl(total)}`}</button>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--mut)" }}>Zwykła oferta Partnera Handlowego daje cashback, ale nie generuje prowizji sieciowej.</p>
    </div>
  </div>;
}
