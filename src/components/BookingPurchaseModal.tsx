import { useEffect, useMemo, useState, type ReactNode } from "react";
import { checkoutBooking, type BookingConfig } from "../lib/api";
import {
  bookingAvailableSlotsV2,
  bookingDailyQuoteV2,
  bookingPublicCatalogV2,
  bookingUnavailableDaysV2,
  createBookingHoldV2,
  type BookingCatalogV2,
  type BookingSlotV2,
} from "../lib/bookingV2";
import { cashbackFor, getMarketConfig } from "../lib/marketConfig";
import { zl } from "../lib/money";
import DailyRangeCalendar from "./DailyRangeCalendar";

type Props = { offerId: string; config: BookingConfig; open: boolean; onClose: () => void };

const dayKey = (value: string | Date, timezone: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const hourLabel = (iso: string, timezone: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
const dateLabel = (iso: string, timezone: string) =>
  new Date(iso).toLocaleDateString("pl-PL", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
const shortDate = (value: string) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }) : "—";
const dateAtNoonUtc = (value: string) => new Date(`${value}T12:00:00Z`);
const resourceIcon = (kind: string) => kind === "staff" ? "👤" : kind === "vehicle" ? "🚗" : kind === "property" ? "🏠" : kind === "room" ? "🛏️" : kind === "equipment" ? "🧰" : "◉";

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
  const [unavailableDays, setUnavailableDays] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const [cashbackRate, setCashbackRate] = useState(0.03);
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
    setError(null);
    setSelected(null);
    setSelectedDay("");
    setFromDay("");
    setToDay("");
    setRentalBase(0);
    setRentalUnits(0);
    setUnavailableDays([]);
    setAvailabilityWarning(null);
    getMarketConfig().then((c) => setCashbackRate(c.cashbackRate));
    bookingPublicCatalogV2(offerId)
      .then((c) => {
        setCatalog(c);
        setServiceId(c?.services?.[0]?.id ?? null);
        setResourceId(null);
      })
      .catch(() => setCatalog(null));
  }, [open, offerId]);

  useEffect(() => {
    if (!open || activeConfig.booking_type !== "appointment") return;
    setLoading(true);
    setError(null);
    setSelected(null);
    const from = new Date();
    const to = new Date(from.getTime() + Math.min(activeConfig.max_advance_days, 45) * 86400000);
    bookingAvailableSlotsV2(offerId, from, to, serviceId, resourceId)
      .then((rows) => {
        setSlots(rows);
        setSelectedDay(rows[0] ? dayKey(rows[0].starts_at, activeConfig.timezone) : "");
      })
      .catch((e) => setError(e?.message || "Nie udało się pobrać terminów"))
      .finally(() => setLoading(false));
  }, [open, offerId, activeConfig.booking_type, activeConfig.max_advance_days, activeConfig.timezone, serviceId, resourceId]);

  useEffect(() => {
    if (!open || activeConfig.booking_type !== "daily") {
      setAvailabilityLoading(false);
      setUnavailableDays([]);
      setAvailabilityWarning(null);
      return;
    }
    const from = dayKey(new Date(Date.now() + activeConfig.min_notice_hours * 3600000), activeConfig.timezone);
    const to = dayKey(new Date(Date.now() + activeConfig.max_advance_days * 86400000), activeConfig.timezone);
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityWarning(null);
    bookingUnavailableDaysV2(offerId, from, to, resourceId)
      .then((rows) => { if (!cancelled) setUnavailableDays(rows.map((row) => row.day)); })
      .catch(() => {
        if (!cancelled) {
          setUnavailableDays([]);
          setAvailabilityWarning("Nie udało się wczytać zajętych dni. Wybrany zakres zostanie jeszcze sprawdzony przez serwer przed płatnością.");
        }
      })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [open, offerId, activeConfig.booking_type, activeConfig.min_notice_hours, activeConfig.max_advance_days, activeConfig.timezone, resourceId]);

  useEffect(() => {
    if (!open || activeConfig.booking_type !== "daily" || !fromDay || !toDay) {
      setRentalBase(0);
      setRentalUnits(0);
      return;
    }
    setError(null);
    bookingDailyQuoteV2(offerId, fromDay, toDay, resourceId)
      .then((q) => { setRentalUnits(q.days); setRentalBase(q.base); })
      .catch((e) => {
        setRentalBase(0);
        setRentalUnits(0);
        setError(e?.message || "Nie udało się policzyć ceny");
      });
  }, [open, offerId, activeConfig.booking_type, fromDay, toDay, resourceId]);

  const days = useMemo(
    () => Array.from(new Map(slots.map((s) => [dayKey(s.starts_at, activeConfig.timezone), s.starts_at])).entries()),
    [slots, activeConfig.timezone],
  );
  const visibleSlots = slots.filter((s) => dayKey(s.starts_at, activeConfig.timezone) === selectedDay);
  const today = dayKey(new Date(Date.now() + activeConfig.min_notice_hours * 3600000), activeConfig.timezone);
  const latest = dayKey(new Date(Date.now() + activeConfig.max_advance_days * 86400000), activeConfig.timezone);
  const selectedService = catalog?.services.find((s) => s.id === serviceId) ?? null;
  const concreteResourceId = selected?.resource_id ?? resourceId;
  const selectedResource = catalog?.resources.find((r) => r.id === concreteResourceId) ?? null;
  const fees = activeConfig.booking_type === "daily" && rentalUnits > 0 ? Number(activeConfig.cleaning_fee_gross || 0) : 0;
  const deposit = activeConfig.booking_type === "daily" && rentalUnits > 0 ? Number(activeConfig.deposit_gross || 0) : 0;
  const total = activeConfig.booking_type === "appointment"
    ? Number(selected?.amount_gross ?? selectedService?.price_gross ?? activeConfig.price_per_unit)
    : rentalBase + fees;
  const cashback = cashbackFor(total, cashbackRate);
  const ready = activeConfig.booking_type === "appointment" ? Boolean(selected) : rentalUnits >= 1;

  function pickNearest() {
    const first = slots[0];
    if (!first) return;
    setSelectedDay(dayKey(first.starts_at, activeConfig.timezone));
    setSelected(first);
  }

  function setRentalRange(nextFrom: string, nextTo: string) {
    setError(null);
    setFromDay(nextFrom);
    setToDay(nextTo);
    if (!nextTo) {
      setRentalBase(0);
      setRentalUnits(0);
    }
  }

  function selectRentalResource(nextResourceId: string | null) {
    setResourceId(nextResourceId);
    setFromDay("");
    setToDay("");
    setRentalBase(0);
    setRentalUnits(0);
    setUnavailableDays([]);
    setError(null);
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      let hold;
      if (activeConfig.booking_type === "appointment") {
        if (!selected) throw new Error("Wybierz dostępny termin");
        hold = await createBookingHoldV2({
          offerId,
          startsAt: new Date(selected.starts_at),
          endsAt: new Date(selected.ends_at),
          serviceId,
          resourceId: selected.resource_id ?? resourceId,
        });
      } else {
        if (!fromDay || !toDay || rentalUnits < 1) throw new Error("Wybierz prawidłowy okres rezerwacji");
        if (rentalUnits < Number(activeConfig.min_units || 1)) throw new Error(`Minimalny okres to ${activeConfig.min_units} dni`);
        if (rentalUnits > activeConfig.max_units) throw new Error(`Maksymalny okres to ${activeConfig.max_units} dni`);
        hold = await createBookingHoldV2({ offerId, startsAt: dateAtNoonUtc(fromDay), endsAt: dateAtNoonUtc(toDay), resourceId });
      }
      const result = await checkoutBooking(hold.booking_id, payment);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = `/rezerwacje?paid=success&booking=${hold.booking_id}&order=${result.order_id}`;
    } catch (e: any) {
      const message = e?.message || "Nie udało się opłacić rezerwacji";
      if (message.toLowerCase().includes("zaloguj") || message.toLowerCase().includes("autoryz")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const serviceStep = catalog?.services?.length ? 1 : 0;
  const resourceStep = catalog?.resources?.length ? 1 : 0;
  const appointmentDateStep = serviceStep + resourceStep + 1;
  const dailyResourceStep = activeConfig.booking_type === "daily" && catalog?.resources?.length ? 1 : 0;
  const dailyDateStep = dailyResourceStep + 1;
  const paymentStep = activeConfig.booking_type === "appointment" ? appointmentDateStep + 1 : dailyDateStep + 1;

  return <div className="fixed inset-0 z-[70] bg-black/75 p-0 sm:grid sm:place-items-center sm:p-4" onMouseDown={onClose}>
    <div className="flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()} style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-[11px] font-semibold tracking-[.16em]" style={{ color: "var(--gold)" }}>{activeConfig.booking_type === "appointment" ? "REZERWACJA TERMINU" : "REZERWACJA ONLINE"}</div>
          <h2 className="mt-1 font-display text-2xl font-semibold">{activeConfig.booking_type === "appointment" ? "Wybierz usługę i termin" : catalog?.resources?.length ? "Wybierz zasób i daty wynajmu" : "Wybierz daty wynajmu"}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Po wyborze blokujemy termin na 15 minut na czas płatności.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} aria-label="Zamknij">✕</button>
      </header>

      <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1fr_330px]">
        <main className="space-y-6 p-5 sm:p-7">
          {activeConfig.booking_type === "appointment" ? <>
            {catalog?.services?.length ? <section>
              <StepTitle n={1} title="Wybierz usługę" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{catalog.services.map((s) => <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setSelected(null); }} className="rounded-2xl p-4 text-left" style={{ border: serviceId === s.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: serviceId === s.id ? "rgba(200,150,90,.12)" : "var(--glass)" }}><div className="flex justify-between gap-3"><div><b>{s.name}</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{s.duration_minutes} min{s.description ? ` · ${s.description}` : ""}</div></div><b style={{ color: "var(--gold)" }}>{zl(s.price_gross)}</b></div></button>)}</div>
            </section> : null}

            {catalog?.resources?.length ? <section>
              <StepTitle n={serviceStep + 1} title="Wybierz pracownika lub zasób" optional />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setResourceId(null); setSelected(null); }} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: !resourceId ? "1px solid var(--gold)" : "1px solid var(--line)", background: !resourceId ? "rgba(200,150,90,.10)" : "var(--glass)" }}>⚡ Dowolny dostępny</button>
                {catalog.resources.map((r) => <button key={r.id} type="button" onClick={() => { setResourceId(r.id); setSelected(null); }} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: resourceId === r.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: resourceId === r.id ? "rgba(200,150,90,.10)" : "var(--glass)" }}>{resourceIcon(r.kind)} {r.name}</button>)}
              </div>
            </section> : null}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <StepTitle n={appointmentDateStep} title="Wybierz dzień i godzinę" />
                {slots.length > 0 && <button type="button" onClick={pickNearest} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Najbliższy wolny termin</button>}
              </div>
              {loading && <Info>Pobieram dostępne terminy…</Info>}
              {!loading && days.length === 0 && <Info><b>Brak wolnych terminów.</b> Spróbuj wybrać inną usługę albo zasób.</Info>}
              {days.length > 0 && <>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-2">{days.map(([key, iso]) => <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelected(null); }} className="shrink-0 rounded-2xl px-4 py-3 text-left" style={{ background: selectedDay === key ? "var(--gold)" : "var(--glass)", color: selectedDay === key ? "#211406" : "var(--ink)", border: "1px solid var(--line)" }}><div className="text-xs opacity-80">{new Date(iso).toLocaleDateString("pl-PL", { timeZone: activeConfig.timezone, weekday: "short" })}</div><div className="font-semibold">{new Date(iso).toLocaleDateString("pl-PL", { timeZone: activeConfig.timezone, day: "numeric", month: "short" })}</div></button>)}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{visibleSlots.map((slot) => <button key={`${slot.starts_at}-${slot.resource_id || "offer"}`} type="button" onClick={() => setSelected(slot)} className="rounded-xl py-3 text-sm font-semibold" style={{ background: selected?.starts_at === slot.starts_at && selected?.resource_id === slot.resource_id ? "rgba(34,197,94,.16)" : "var(--glass)", border: selected?.starts_at === slot.starts_at && selected?.resource_id === slot.resource_id ? "1px solid var(--green)" : "1px solid var(--line)", color: selected?.starts_at === slot.starts_at && selected?.resource_id === slot.resource_id ? "var(--green)" : "var(--ink)" }}>{hourLabel(slot.starts_at, activeConfig.timezone)}</button>)}</div>
              </>}
            </section>
          </> : <>
            {catalog?.resources?.length ? <section>
              <StepTitle n={1} title="Wybierz konkretny zasób" optional />
              <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Możesz wybrać konkretny egzemplarz albo zostawić automatyczny przydział pierwszego wolnego przez cały pobyt.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => selectRentalResource(null)} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: !resourceId ? "1px solid var(--gold)" : "1px solid var(--line)", background: !resourceId ? "rgba(200,150,90,.10)" : "var(--glass)" }}>⚡ Dowolny dostępny</button>
                {catalog.resources.map((r) => <button key={r.id} type="button" onClick={() => selectRentalResource(r.id)} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: resourceId === r.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: resourceId === r.id ? "rgba(200,150,90,.10)" : "var(--glass)" }}>{resourceIcon(r.kind)} {r.name}</button>)}
              </div>
            </section> : null}

            <section>
              <StepTitle n={dailyDateStep} title="Wybierz okres" />
              {availabilityLoading ? <Info>Sprawdzam zajęte i zablokowane dni{selectedResource ? ` dla ${selectedResource.name}` : ""}…</Info> : <DailyRangeCalendar
                minDate={today}
                maxDate={latest}
                minUnits={Number(activeConfig.min_units || 1)}
                maxUnits={Number(activeConfig.max_units || 1)}
                from={fromDay}
                to={toDay}
                unavailableDates={unavailableDays}
                onChange={setRentalRange}
              />}
              {availabilityWarning && <div className="mt-3 rounded-2xl px-4 py-3 text-xs" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.22)", color: "var(--gold)" }}>{availabilityWarning}</div>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--mut)" }}>
                <span>Minimalnie {activeConfig.min_units} dni · maksymalnie {activeConfig.max_units} dni</span>
                <span>Rezerwacja do {shortDate(latest)}</span>
              </div>
              {fromDay && toDay && rentalUnits === 0 && !error && <Info>Sprawdzam cenę i dostępność wybranego okresu…</Info>}
              {rentalUnits > 0 && <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><PriceRow label={`${rentalUnits} ${rentalUnits === 1 ? "dzień" : "dni"}`} value={rentalBase} strong />{fees > 0 && <PriceRow label="Przygotowanie / opłata dodatkowa" value={fees} />}{deposit > 0 && <PriceRow label="Kaucja zabezpieczająca" value={deposit} muted />}</div>}
            </section>
          </>}

          <section>
            <StepTitle n={paymentStep} title="Wybierz płatność" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPayment("wallet")} className="rounded-2xl p-4 text-left" style={{ border: payment === "wallet" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "wallet" ? "rgba(200,150,90,.12)" : "var(--glass)" }}><b>Sunrise Pay</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Płatność z portfela MySunrise</div></button>
              <button type="button" onClick={() => setPayment("card")} className="rounded-2xl p-4 text-left" style={{ border: payment === "card" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "card" ? "rgba(200,150,90,.12)" : "var(--glass)" }}><b>Karta / BLIK / P24</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Bezpieczna płatność online</div></button>
            </div>
          </section>

          {error && <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)", color: "#fca5a5" }}>{error}</div>}
        </main>

        <aside className="border-t p-5 lg:border-l lg:border-t-0 lg:p-6" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--glass) 55%, transparent)" }}>
          <div className="lg:sticky lg:top-0">
            <h3 className="text-lg font-semibold">Podsumowanie</h3>
            <div className="mt-4 space-y-3 text-sm">
              {activeConfig.booking_type === "appointment" ? <>
                <SummaryRow label="Usługa" value={selectedService?.name || "Oferta"} />
                <SummaryRow label="Obsługa" value={selectedResource?.name || (selected ? "Przydzielona automatycznie" : resourceId ? "Wybrany zasób" : "Dowolny dostępny")} muted={!selectedResource && !selected} />
                <SummaryRow label="Termin" value={selected ? `${dateLabel(selected.starts_at, activeConfig.timezone)}, ${hourLabel(selected.starts_at, activeConfig.timezone)}` : "Wybierz termin"} muted={!selected} />
              </> : <>
                {catalog?.resources?.length ? <SummaryRow label="Zasób" value={selectedResource?.name || "Dowolny dostępny · przydzielimy automatycznie"} muted={!selectedResource} /> : null}
                <SummaryRow label="Od" value={shortDate(fromDay)} muted={!fromDay} />
                <SummaryRow label="Do" value={shortDate(toDay)} muted={!toDay} />
                <SummaryRow label="Okres" value={rentalUnits > 0 ? `${rentalUnits} ${rentalUnits === 1 ? "dzień" : "dni"}` : "Wybierz daty"} muted={rentalUnits < 1} />
              </>}
            </div>
            <div className="my-5 border-t" style={{ borderColor: "var(--line)" }} />
            <div className="flex items-end justify-between gap-3"><span className="text-sm">Do zapłaty</span><strong className="font-display text-3xl" style={{ color: "var(--gold)" }}>{zl(total)}</strong></div>
            {cashback > 0 && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>+ {zl(cashback)} cashbacku na portfel</div>}
            {deposit > 0 && <div className="mt-3 text-xs" style={{ color: "var(--mut)" }}>Kaucja {zl(deposit)} stanowi zabezpieczenie i nie jest naliczana do cashbacku.</div>}
            <div className="mt-5 space-y-2 text-xs" style={{ color: "var(--mut)" }}><div>✓ Bezpieczna płatność</div><div>✓ Termin blokowany na 15 minut</div><div>✓ {activeConfig.instant_booking ? "Potwierdzenie automatycznie po płatności" : "Potwierdzenie po akceptacji sprzedawcy"}</div></div>
            <button type="button" disabled={busy || total <= 0 || !ready} onClick={pay} className="mt-5 w-full rounded-2xl py-3.5 font-bold text-black disabled:opacity-45" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Rezerwuję i przekierowuję…" : ready ? `Rezerwuję i płacę ${zl(total)}` : activeConfig.booking_type === "appointment" ? "Najpierw wybierz termin" : "Najpierw wybierz daty"}</button>
          </div>
        </aside>
      </div>
    </div>
  </div>;
}

function StepTitle({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return <div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-black" style={{ background: "var(--gold)" }}>{n}</span><div className="font-semibold">{title}{optional && <span className="ml-2 text-xs font-normal" style={{ color: "var(--mut)" }}>(opcjonalnie)</span>}</div></div>;
}
function Info({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>{children}</div>;
}
function PriceRow({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`} style={{ color: muted ? "var(--mut)" : "var(--ink)" }}><span>{label}</span><span>{zl(value)}</span></div>;
}
function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-start justify-between gap-4"><span style={{ color: "var(--mut)" }}>{label}</span><span className="text-right font-medium" style={{ color: muted ? "var(--mut)" : "var(--ink)" }}>{value}</span></div>;
}
