import { useEffect, useMemo, useState, type ReactNode, useRef } from "react";
import { getOffer, type BookingConfig } from "../lib/api";
import { supabase } from "../lib/supabase";
import { EMPTY_RENTER, RENTAL_AGREEMENT_VERSION, rentalAgreementText, sha256Text, type RenterData } from "../lib/rentalAgreement";
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
import { checkoutWithInvoice, EMPTY_INVOICE, invoiceComplete } from "../lib/invoiceCheckout";
import { zl } from "../lib/money";
import DailyRangeCalendar from "./DailyRangeCalendar";
import InvoiceDetailsFields from "./InvoiceDetailsFields";

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
const rentalUnitsLabel = (units: number) => units === 1 ? "1 doba" : units >= 2 && units <= 4 ? `${units} doby` : `${units} dób`;

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
  const [invoice, setInvoice] = useState(() => ({ ...EMPTY_INVOICE }));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Umowa najmu (wynajem na dni): dane najemcy + akceptacja przed zapłatą (decyzja właściciela 2026-09-06)
  const [renter, setRenter] = useState<RenterData>(() => ({ ...EMPTY_RENTER }));
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [offerFacts, setOfferFacts] = useState<{ title: string; seller: string; attributes: Record<string, unknown> } | null>(null);
  // „Wróć” działa jak w aplikacji: otwarcie okna dokłada wpis historii, gest/przycisk wstecz telefonu, Esc i przycisk „Wróć”
  // zamykają okno i wracają do oferty (decyzja właściciela 2026-09-06 — „przy rezerwacji nie ma możliwości powrotu”).
  const closingRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    try { window.history.pushState({ smBooking: true }, ""); } catch { /* ignoruj */ }
    const onPop = () => { closingRef.current = true; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") goBack(); };
    window.addEventListener("popstate", onPop); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  function goBack() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.history.state?.smBooking) { window.history.back(); return; }
    onClose();
  }
  useEffect(() => {
    if (!open || config.booking_type !== "daily") return;
    getOffer(offerId).then((o: any) => o && setOfferFacts({ title: String(o.title || ""), seller: String(o.seller_name || o.seller || ""), attributes: (o.attributes || {}) as Record<string, unknown> })).catch(() => {});
  }, [open, offerId, config.booking_type]);

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
    setInvoice({ ...EMPTY_INVOICE });
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
        setError(e?.message || "Nie udało się obliczyć czynszu za wybrany okres");
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
  const paymentTotal = total + deposit;
  const cashback = cashbackFor(total, cashbackRate);
  const ready = activeConfig.booking_type === "appointment" ? Boolean(selected) : rentalUnits >= 1;
  const invoiceReady = invoiceComplete(invoice);
  const isDaily = activeConfig.booking_type === "daily";
  const lengthDiscounts = ((catalog?.config as any)?.length_discounts as Array<{ min_days: number; pct: number }> | undefined)?.filter((d) => d.pct > 0).sort((a, b) => a.min_days - b.min_days) ?? [];
  const appliedDiscount = lengthDiscounts.filter((d) => rentalUnits >= d.min_days).reduce((m, d) => Math.max(m, d.pct), 0);
  const isVehicle = isDaily && (selectedResource?.kind === "vehicle" || ["samochod", "car"].includes(String(offerFacts?.attributes?.offer_type || "")) || String(offerFacts?.attributes?.brand || "") !== "");
  const minLicenseYears = isVehicle ? Number((offerFacts?.attributes?.rental_operations as any)?.min_license_years ?? 2) || 0 : 0;
  const licenseYearOk = /^\d{4}$/.test(renter.license_since_year.trim()) && Number(renter.license_since_year) <= new Date().getFullYear() - minLicenseYears && Number(renter.license_since_year) >= 1950;
  const renterReady = !isDaily || (renter.full_name.trim().length >= 3 && renter.phone.trim().length >= 7 && renter.doc_number.trim().length >= 4 && (!isVehicle || (renter.license_number.trim().length >= 4 && licenseYearOk)));
  const agreementText = isDaily ? rentalAgreementText({
    item: offerFacts?.title || "Przedmiot najmu", sellerName: offerFacts?.seller || "Wynajmujący", from: shortDate(fromDay), to: shortDate(toDay), units: rentalUnits,
    rent: rentalBase, deposit, fees, isVehicle,
    kmLimitPerDay: Number(offerFacts?.attributes?.km_limit_per_day || (offerFacts?.attributes?.rental_operations as any)?.included_km_per_day || offerFacts?.attributes?.mileage_limit || 0) || null,
    extraKmRate: Number((offerFacts?.attributes?.rental_operations as any)?.excess_km_fee || 0) || null,
    minDriverAge: Number(offerFacts?.attributes?.min_driver_age || (offerFacts?.attributes?.rental_operations as any)?.min_driver_age || 0) || null,
    minLicenseYears: minLicenseYears || null,
    pickupLocation: String(offerFacts?.attributes?.pickup_location || offerFacts?.attributes?.location || "") || null,
  }, renter) : "";

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
      if (!invoiceReady) throw new Error("Uzupełnij poprawne dane do faktury");
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
        if (rentalUnits < Number(activeConfig.min_units || 1)) throw new Error(`Minimalny okres to ${activeConfig.min_units} dób`);
        if (rentalUnits > activeConfig.max_units) throw new Error(`Maksymalny okres to ${activeConfig.max_units} dób`);
        if (!renterReady) throw new Error("Uzupełnij dane najemcy (imię i nazwisko, telefon, dokument" + (isVehicle ? ", prawo jazdy" : "") + ")");
        if (!agreementAccepted) throw new Error("Zaakceptuj umowę najmu — bez tego nie można opłacić rezerwacji");
        hold = await createBookingHoldV2({ offerId, startsAt: dateAtNoonUtc(fromDay), endsAt: dateAtNoonUtc(toDay), resourceId });
        const { error: agreementError } = await supabase.rpc("accept_rental_agreement", { p_booking: hold.booking_id, p_version: RENTAL_AGREEMENT_VERSION, p_sha256: await sha256Text(agreementText), p_renter: renter, p_user_agent: navigator.userAgent, p_text: agreementText });
        if (agreementError) throw new Error(agreementError.message);
      }
      const result = await checkoutWithInvoice({ booking_id: hold.booking_id, payment_method: payment }, invoice);
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

  return <div className="fixed inset-0 z-[70] bg-black/75 p-0 sm:grid sm:place-items-center sm:p-4" onMouseDown={goBack}>
    <div className="flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-[11px] font-semibold tracking-[.16em]" style={{ color: "var(--gold)" }}>{activeConfig.booking_type === "appointment" ? "REZERWACJA TERMINU" : "REZERWACJA WYNAJMU"}</div>
          <h2 className="mt-1 font-display text-2xl font-semibold">{activeConfig.booking_type === "appointment" ? "Wybierz usługę i termin" : catalog?.resources?.length ? "Wybierz egzemplarz i daty" : "Wybierz daty wynajmu"}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{activeConfig.booking_type === "appointment" ? "Po wyborze blokujemy termin na 15 minut na czas płatności." : `Cena bazowa: ${zl(Number(activeConfig.price_per_unit || 0))} / dobę. Po wyborze dat zobaczysz czynsz za cały okres${Number(activeConfig.deposit_gross || 0) > 0 ? " oraz kaucję" : ""}.`}</p>
        </div>
        <button type="button" onClick={goBack} className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} aria-label="Wróć do oferty"><span aria-hidden="true">←</span> Wróć</button>
      </header>

      <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1fr_330px]">
        <main className="space-y-6 p-5 sm:p-7">
          {activeConfig.booking_type === "appointment" ? <>
            {catalog?.services?.length ? <section>
              <StepTitle n={1} title="Wybierz usługę" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{catalog.services.map((s) => <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setSelected(null); }} className="rounded-2xl p-4 text-left" style={{ border: serviceId === s.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: serviceId === s.id ? "rgba(232,137,26,.12)" : "var(--glass)" }}><div className="flex justify-between gap-3"><div><b>{s.name}</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{s.duration_minutes} min{s.description ? ` · ${s.description}` : ""}</div></div><b style={{ color: "var(--gold)" }}>{zl(s.price_gross)}</b></div></button>)}</div>
            </section> : null}

            {catalog?.resources?.length ? <section>
              <StepTitle n={serviceStep + 1} title="Wybierz pracownika lub zasób" optional />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setResourceId(null); setSelected(null); }} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: !resourceId ? "1px solid var(--gold)" : "1px solid var(--line)", background: !resourceId ? "rgba(232,137,26,.10)" : "var(--glass)" }}>⚡ Dowolny dostępny</button>
                {catalog.resources.map((r) => <button key={r.id} type="button" onClick={() => { setResourceId(r.id); setSelected(null); }} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: resourceId === r.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: resourceId === r.id ? "rgba(232,137,26,.10)" : "var(--glass)" }}>{resourceIcon(r.kind)} {r.name}</button>)}
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
              <StepTitle n={1} title="Wybierz konkretny egzemplarz" optional />
              <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Możesz wybrać konkretny egzemplarz albo zostawić automatyczny przydział jednego wolnego przez cały okres.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => selectRentalResource(null)} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: !resourceId ? "1px solid var(--gold)" : "1px solid var(--line)", background: !resourceId ? "rgba(232,137,26,.10)" : "var(--glass)" }}>⚡ Dowolny dostępny</button>
                {catalog.resources.map((r) => <button key={r.id} type="button" onClick={() => selectRentalResource(r.id)} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ border: resourceId === r.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: resourceId === r.id ? "rgba(232,137,26,.10)" : "var(--glass)" }}>{resourceIcon(r.kind)} {r.name}</button>)}
              </div>
            </section> : null}

            <section>
              <StepTitle n={dailyDateStep} title="Wybierz daty od–do" />
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
              {availabilityWarning && <div className="mt-3 rounded-2xl px-4 py-3 text-xs" style={{ background: "rgba(232,137,26,.08)", border: "1px solid rgba(232,137,26,.22)", color: "var(--gold)" }}>{availabilityWarning}</div>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--mut)" }}>
                <span>Minimalnie {activeConfig.min_units} dób · maksymalnie {activeConfig.max_units} dób</span>
                <span>Rezerwacja do {shortDate(latest)}</span>
              </div>
              {fromDay && toDay && rentalUnits === 0 && !error && <Info>Sprawdzam dostępność i obliczam czynsz za wybrany okres…</Info>}
              {lengthDiscounts.length > 0 && <div className="mt-3 text-xs" style={{ color: "var(--green)" }}>Rabat za dłuższy najem: {lengthDiscounts.map((d) => `od ${d.min_days} dni −${d.pct}%`).join(" · ")}</div>}
              {rentalUnits > 0 && <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><PriceRow label={`Czynsz za najem · ${rentalUnitsLabel(rentalUnits)}${appliedDiscount ? ` · rabat −${appliedDiscount}%` : ""}`} value={rentalBase} strong />{fees > 0 && <PriceRow label="Opłata dodatkowa" value={fees} />}{deposit > 0 && <PriceRow label="Kaucja zwrotna" value={deposit} muted />}</div>}
            </section>
          </>}

          <section>
            <StepTitle n={paymentStep} title="Wybierz płatność" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPayment("wallet")} className="rounded-2xl p-4 text-left" style={{ border: payment === "wallet" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "wallet" ? "rgba(232,137,26,.12)" : "var(--glass)" }}><b>Sunrise Pay</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Płatność z portfela MySunrise</div></button>
              <button type="button" onClick={() => setPayment("card")} className="rounded-2xl p-4 text-left" style={{ border: payment === "card" ? "1px solid var(--gold)" : "1px solid var(--line)", background: payment === "card" ? "rgba(232,137,26,.12)" : "var(--glass)" }}><b>Karta (Stripe)</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Bezpieczna płatność online</div></button>
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
                {catalog?.resources?.length ? <SummaryRow label="Egzemplarz" value={selectedResource?.name || "Dowolny dostępny · przydzielimy automatycznie"} muted={!selectedResource} /> : null}
                <SummaryRow label="Od" value={shortDate(fromDay)} muted={!fromDay} />
                <SummaryRow label="Do" value={shortDate(toDay)} muted={!toDay} />
                <SummaryRow label="Okres" value={rentalUnits > 0 ? rentalUnitsLabel(rentalUnits) : "Wybierz daty"} muted={rentalUnits < 1} />
                {rentalUnits > 0 && <SummaryRow label="Czynsz" value={zl(rentalBase + fees)} />}
                {deposit > 0 && <SummaryRow label="Kaucja" value={zl(deposit)} />}
              </>}
            </div>
            <div className="my-5 border-t" style={{ borderColor: "var(--line)" }} />
            <div className="flex items-end justify-between gap-3"><span className="text-sm">Do zapłaty teraz</span><strong className="font-display text-3xl" style={{ color: "var(--gold)" }}>{zl(paymentTotal)}</strong></div>
            {cashback > 0 && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>+ {zl(cashback)} cashbacku na portfel</div>}
            {deposit > 0 && <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(232,137,26,.08)", border: "1px solid rgba(232,137,26,.20)", color: "var(--mut)" }}>Kaucja {zl(deposit)} jest pobierana razem z czynszem. Nie podlega cashbackowi ani prowizjom. Po zakończeniu najmu sprzedawca zwraca ją albo rozlicza zgodnie ze stanem przedmiotu/pojazdu.</div>}
            {isDaily && rentalUnits > 0 && <div className="mt-4 rounded-2xl p-3" style={{ border: "1px solid rgba(232,137,26,.28)", background: "rgba(232,137,26,.05)" }}>
              <div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>UMOWA NAJMU · DANE NAJEMCY</div>
              <div className="mt-2 grid gap-2">
                <input className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Imię i nazwisko *" value={renter.full_name} onChange={(e) => setRenter({ ...renter, full_name: e.target.value })} autoComplete="name" />
                <input className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Telefon *" value={renter.phone} onChange={(e) => setRenter({ ...renter, phone: e.target.value })} autoComplete="tel" inputMode="tel" />
                <div className="grid grid-cols-[auto_1fr] gap-2"><select className="rounded-xl px-2 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} value={renter.doc_type} onChange={(e) => setRenter({ ...renter, doc_type: e.target.value as RenterData["doc_type"] })}><option>dowód osobisty</option><option>paszport</option></select><input className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Numer dokumentu *" value={renter.doc_number} onChange={(e) => setRenter({ ...renter, doc_number: e.target.value })} /></div>
                {isVehicle && <div className="grid grid-cols-[1fr_auto] gap-2"><input className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Nr prawa jazdy *" value={renter.license_number} onChange={(e) => setRenter({ ...renter, license_number: e.target.value })} /><input className="w-24 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="od roku *" inputMode="numeric" maxLength={4} value={renter.license_since_year} onChange={(e) => setRenter({ ...renter, license_since_year: e.target.value.replace(/\D/g, "") })} /></div>}
                {isVehicle && minLicenseYears > 0 && <div className="text-[11px]" style={{ color: /^\d{4}$/.test(renter.license_since_year) && !licenseYearOk ? "#fca5a5" : "var(--mut)" }}>Wymagane prawo jazdy kat. B od co najmniej {minLicenseYears} lat{/^\d{4}$/.test(renter.license_since_year) && !licenseYearOk ? " — ten staż nie spełnia warunku wynajmu." : "."}</div>}
                <input className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Adres (opcjonalnie)" value={renter.address} onChange={(e) => setRenter({ ...renter, address: e.target.value })} autoComplete="street-address" />
              </div>
              <button type="button" onClick={() => setAgreementOpen((v) => !v)} className="mt-2 text-xs font-semibold underline" style={{ color: "var(--gold)" }}>{agreementOpen ? "Zwiń umowę" : "Przeczytaj umowę najmu (wersja " + RENTAL_AGREEMENT_VERSION + ")"}</button>
              {agreementOpen && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-[11px] leading-4" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--mut)" }}>{agreementText}</pre>}
              <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={agreementAccepted} onChange={(e) => setAgreementAccepted(e.target.checked)} /><span>Akceptuję umowę najmu i potwierdzam, że podane dane są prawdziwe. Kaucja {zl(deposit)} jest pobierana teraz razem z czynszem i rozliczana po protokole zwrotu.</span></label>
            </div>}
            <InvoiceDetailsFields value={invoice} onChange={setInvoice} compact />
            <div className="mt-5 space-y-2 text-xs" style={{ color: "var(--mut)" }}><div>✓ Bezpieczna płatność</div><div>✓ Termin blokowany na 15 minut</div><div>✓ {activeConfig.instant_booking ? "Rezerwacja potwierdzona automatycznie po płatności" : "Rezerwacja potwierdzona po akceptacji sprzedawcy"}</div></div>
            <button type="button" disabled={busy || paymentTotal <= 0 || !ready || !invoiceReady || !renterReady || (isDaily && !agreementAccepted)} onClick={pay} className="mt-5 w-full rounded-2xl py-3.5 font-bold text-black disabled:opacity-45" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{busy ? "Rezerwuję i przekierowuję…" : !invoiceReady ? "Uzupełnij dane do faktury" : isDaily && ready && !renterReady ? "Uzupełnij dane najemcy" : isDaily && ready && !agreementAccepted ? "Zaakceptuj umowę najmu" : ready ? `Rezerwuję i płacę ${zl(paymentTotal)}` : activeConfig.booking_type === "appointment" ? "Najpierw wybierz termin" : "Najpierw wybierz daty"}</button>
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
