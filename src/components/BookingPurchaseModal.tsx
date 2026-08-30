import { useEffect, useMemo, useState } from "react";
import { checkoutBooking, type BookingConfig } from "../lib/api";
import {
  bookingAvailableSlotsV2,
  bookingDailyQuoteV2,
  bookingPublicCatalogV2,
  createBookingHoldV2,
  type BookingCatalogV2,
  type BookingSlotV2,
} from "../lib/bookingV2";
import { zl } from "../lib/money";

type Props = { offerId: string; config: BookingConfig; open: boolean; onClose: () => void };
const dayKey = (value: string | Date, timezone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const dayLabel = (iso: string, timezone: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
const hourLabel = (iso: string, timezone: string) => new Date(iso).toLocaleTimeString("pl-PL", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
const dateAtNoonUtc = (value: string) => new Date(`${value}T12:00:00Z`);

export default function BookingPurchaseModal({ offerId, config, open, onClose }: Props) {
  const [catalog, setCatalog] = useState<BookingCatalogV2 | null>(null);
  const [slots, setSlots] = useState<BookingSlotV2[]>([]);
  const [selected, setSelected] = useState<BookingSlotV2 | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [rentalBase, setRentalBase] = useState(0);
  const [rentalUnits, setRentalUnits] = useState(0);
  const [payment, setPayment] = useState<"wallet" | "card">("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = catalog?.config ?? {
    offer_id: config.offer_id,
    booking_type: config.booking_type,
    timezone: config.timezone,
    duration_minutes: config.duration_minutes,
    slot_interval_minutes: config.slot_interval_minutes,
    min_notice_hours: config.min_notice_hours,
    max_advance_days: config.max_advance_days,
    min_units: 1,
    max_units: config.max_units,
    price_per_unit: Number(config.price_per_unit),
    cleaning_fee_gross: 0,
    deposit_gross: 0,
    instant_booking: true,
  };

  useEffect(() => {
    if (!open) return;
    setError(null); setSelected(null); setSelectedDay(""); setFromDay(""); setToDay(""); setRentalBase(0); setRentalUnits(0);
    bookingPublicCatalogV2(offerId).then((c) => {
      setCatalog(c);
      setServiceId(c?.services?.[0]?.id ?? null);
      setResourceId(null);
    }).catch(() => setCatalog(null));
  }, [open, offerId]);

  useEffect(() => {
    if (!open || activeConfig.booking_type !== "appointment") return;
    setLoading(true); setError(null); setSelected(null);
    const from = new Date();
    const to = new Date(from.getTime() + Math.min(activeConfig.max_advance_days, 45) * 86400000);
    bookingAvailableSlotsV2(offerId, from, to, serviceId, resourceId).then((rows) => {
      setSlots(rows);
      setSelectedDay(rows[0] ? dayKey(rows[0].starts_at, activeConfig.timezone) : "");
    }).catch((e) => setError(e?.message || "Nie udało się pobrać terminów")).finally(() => setLoading(false));
  }, [open, offerId, activeConfig.booking_type, activeConfig.max_advance_days, activeConfig.timezone, serviceId, resourceId]);

  useEffect(() => {
    if (!open || activeConfig.booking_type !== "daily" || !fromDay || !toDay) { setRentalBase(0); setRentalUnits(0); return; }
    bookingDailyQuoteV2(offerId, fromDay, toDay).then((q) => { setRentalUnits(q.days); setRentalBase(q.base); }).catch((e) => setError(e?.message || "Nie udało się policzyć ceny"));
  }, [open, offerId, activeConfig.booking_type, fromDay, toDay]);

  const days = useMemo(() => Array.from(new Map(slots.map((s) => [dayKey(s.starts_at, activeConfig.timezone), s.starts_at])).entries()), [slots, activeConfig.timezone]);
  const visibleSlots = slots.filter((s) => dayKey(s.starts_at, activeConfig.timezone) === selectedDay);
  const today = dayKey(new Date(Date.now() + activeConfig.min_notice_hours * 3600000), activeConfig.timezone);
  const latest = dayKey(new Date(Date.now() + activeConfig.max_advance_days * 86400000), activeConfig.timezone);
  const selectedService = catalog?.services.find(s => s.id === serviceId) ?? null;
  const selectedResource = catalog?.resources.find(r => r.id === resourceId) ?? null;
  const fees = activeConfig.booking_type === "daily" && rentalUnits > 0 ? Number(activeConfig.cleaning_fee_gross || 0) : 0;
  const deposit = activeConfig.booking_type === "daily" && rentalUnits > 0 ? Number(activeConfig.deposit_gross || 0) : 0;
  const total = activeConfig.booking_type === "appointment" ? Number(selected?.amount_gross ?? selectedService?.price_gross ?? activeConfig.price_per_unit) : rentalBase + fees;

  async function pay() {
    setBusy(true); setError(null);
    try {
      let hold;
      if (activeConfig.booking_type === "appointment") {
        if (!selected) throw new Error("Wybierz dostępny termin");
        hold = await createBookingHoldV2({ offerId, startsAt: new Date(selected.starts_at), endsAt: new Date(selected.ends_at), serviceId, resourceId });
      } else {
        if (!fromDay || !toDay || rentalUnits < 1) throw new Error("Wybierz prawidłowy okres rezerwacji");
        if (rentalUnits < Number(activeConfig.min_units || 1)) throw new Error(`Minimalny okres to ${activeConfig.min_units} dni`);
        if (rentalUnits > activeConfig.max_units) throw new Error(`Maksymalny okres to ${activeConfig.max_units} dni`);
        hold = await createBookingHoldV2({ offerId, startsAt: dateAtNoonUtc(fromDay), endsAt: dateAtNoonUtc(toDay), resourceId });
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
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 sm:p-7" onMouseDown={(e) => e.stopPropagation()} style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><div className="text-xs font-semibold tracking-[.15em]" style={{color:"var(--gold)"}}>{activeConfig.booking_type === "appointment" ? "BOOKING USŁUGI" : "REZERWACJA ONLINE"}</div><h2 className="mt-1 font-display text-2xl font-semibold">{activeConfig.booking_type === "appointment" ? "Wybierz usługę i termin" : "Wybierz daty pobytu / wynajmu"}</h2><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Termin blokujemy na 15 minut na czas bezpiecznej płatności.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1" aria-label="Zamknij">✕</button>
      </div>

      {activeConfig.booking_type === "appointment" ? <div className="space-y-5">
        {catalog?.services?.length ? <section><div className="mb-2 text-sm font-semibold">1. Wybierz usługę</div><div className="grid gap-2 sm:grid-cols-2">{catalog.services.map(s => <button key={s.id} type="button" onClick={() => {setServiceId(s.id);setSelected(null);}} className="rounded-2xl p-4 text-left" style={{border:serviceId===s.id?"1px solid var(--gold)":"1px solid var(--line)",background:serviceId===s.id?"rgba(200,150,90,.12)":"var(--glass)"}}><div className="flex justify-between gap-3"><b>{s.name}</b><b style={{color:"var(--gold)"}}>{zl(s.price_gross)}</b></div><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>{s.duration_minutes} min{s.description?` · ${s.description}`:""}</div></button>)}</div></section> : null}

        {catalog?.resources?.length ? <section><div className="mb-2 text-sm font-semibold">2. Wybierz pracownika / zasób</div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setResourceId(null);setSelected(null);}} className="rounded-xl px-3 py-2 text-sm" style={{border:!resourceId?"1px solid var(--gold)":"1px solid var(--line)"}}>Dowolny dostępny</button>{catalog.resources.map(r=><button key={r.id} type="button" onClick={()=>{setResourceId(r.id);setSelected(null);}} className="rounded-xl px-3 py-2 text-sm" style={{border:resourceId===r.id?"1px solid var(--gold)":"1px solid var(--line)"}}>{r.kind==="staff"?"👤":"◉"} {r.name}</button>)}</div></section> : null}

        <section><div className="mb-2 text-sm font-semibold">{catalog?.services?.length || catalog?.resources?.length ? "3." : "1."} Wybierz dzień i godzinę</div>
          {loading && <p style={{ color: "var(--mut)" }}>Pobieram dostępne terminy…</p>}
          {!loading && days.length === 0 && <p className="rounded-xl p-4" style={{ background: "var(--glass)", color: "var(--mut)" }}>Brak wolnych terminów w wybranym zakresie.</p>}
          {days.length > 0 && <><div className="mb-4 flex gap-2 overflow-x-auto pb-2">{days.map(([key, iso]) => <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelected(null); }} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: selectedDay === key ? "var(--gold)" : "var(--glass)", color: selectedDay === key ? "#211406" : "var(--ink)", border: "1px solid var(--line)" }}>{dayLabel(iso, activeConfig.timezone)}</button>)}</div><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{visibleSlots.map((slot) => <button key={slot.starts_at} type="button" onClick={() => setSelected(slot)} className="rounded-xl py-2 text-sm font-semibold" style={{ background: selected?.starts_at === slot.starts_at ? "rgba(34,197,94,.2)" : "var(--glass)", border: selected?.starts_at === slot.starts_at ? "1px solid var(--green)" : "1px solid var(--line)" }}>{hourLabel(slot.starts_at, activeConfig.timezone)}</button>)}</div></>}
        </section>
        {selected && <div className="rounded-xl p-3 text-sm" style={{background:"rgba(122,184,154,.10)",border:"1px solid rgba(122,184,154,.25)"}}>✓ {selectedService?.name || "Usługa"}{selectedResource?` · ${selectedResource.name}`:""} · {dayLabel(selected.starts_at,activeConfig.timezone)} {hourLabel(selected.starts_at,activeConfig.timezone)}</div>}
      </div> : <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Od<input type="date" min={today} max={latest} value={fromDay} onChange={(e) => { setFromDay(e.target.value); if (toDay && e.target.value >= toDay) setToDay(""); }} className="mt-1 w-full rounded-xl px-3 py-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></label><label className="text-sm">Do<input type="date" min={fromDay || today} max={latest} value={toDay} onChange={(e) => setToDay(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} /></label></div>
        {rentalUnits > 0 && <div className="rounded-2xl p-4" style={{background:"var(--glass)",border:"1px solid var(--line)"}}><div className="flex justify-between"><span>{rentalUnits} {rentalUnits===1?"dzień":"dni"}</span><b>{zl(rentalBase)}</b></div>{fees>0&&<div className="mt-2 flex justify-between text-sm"><span>Opłata dodatkowa / przygotowanie</span><span>{zl(fees)}</span></div>}{deposit>0&&<div className="mt-2 flex justify-between text-sm" style={{color:"var(--mut)"}}><span>Kaucja zabezpieczająca</span><span>{zl(deposit)}</span></div>}<div className="mt-3 border-t pt-3 text-xs" style={{borderColor:"var(--line)",color:"var(--mut)"}}>Cena może różnić się między dniami zgodnie z cennikiem sezonowym. Minimalny pobyt: {activeConfig.min_units} dni.</div></div>}
      </div>}

      <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="mb-1 flex items-center justify-between"><span>Do zapłaty teraz</span><strong className="text-xl" style={{ color: "var(--gold)" }}>{zl(total)}</strong></div>{deposit>0&&<div className="mb-3 text-xs" style={{color:"var(--mut)"}}>Kaucja {zl(deposit)} jest zapisana przy rezerwacji jako zabezpieczenie i nie jest wliczana do prowizji/cashbacku.</div>}
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setPayment("wallet")} className="rounded-xl p-3 text-left" style={{ border: payment === "wallet" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "wallet" ? "rgba(200,150,90,.12)" : "transparent" }}><b>Sunrise Pay</b><div className="text-xs" style={{ color: "var(--mut)" }}>Portfel MySunrise</div></button><button type="button" onClick={() => setPayment("card")} className="rounded-xl p-3 text-left" style={{ border: payment === "card" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "card" ? "rgba(200,150,90,.12)" : "transparent" }}><b>Karta / BLIK / P24</b><div className="text-xs" style={{ color: "var(--mut)" }}>Bezpieczna płatność Stripe</div></button></div>
      </div>
      {error && <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,.12)", color: "#fca5a5" }}>{error}</p>}
      <button type="button" disabled={busy || total <= 0 || (activeConfig.booking_type === "appointment" && !selected) || (activeConfig.booking_type === "daily" && rentalUnits < 1)} onClick={pay} className="mt-4 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Rezerwuję i przekierowuję…" : `Rezerwuję i płacę ${zl(total)}`}</button>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--mut)" }}>{activeConfig.instant_booking ? "Po płatności rezerwacja zostanie potwierdzona automatycznie." : "Po płatności rezerwacja będzie oczekiwać na potwierdzenie sprzedawcy."}</p>
    </div>
  </div>;
}
