import { useEffect, useMemo, useState } from "react";

type Props = {
  minDate: string;
  maxDate: string;
  minUnits: number;
  maxUnits: number;
  from: string;
  to: string;
  unavailableDates?: string[];
  onChange: (from: string, to: string) => void;
};

const DAY = 86400000;
const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const monthFmt = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });

function parseDay(value: string) {
  return new Date(`${value}T12:00:00`);
}
function key(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}
function startOfCalendar(d: Date) {
  const x = startOfMonth(d);
  const weekday = x.getDay() || 7;
  return addDays(x, 1 - weekday);
}
function diffDays(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY);
}
function rangeHitsUnavailable(from: string, to: string, unavailable: Set<string>) {
  if (!from || !to || to <= from) return false;
  for (let d = parseDay(from); key(d) < to; d = addDays(d, 1)) {
    if (unavailable.has(key(d))) return true;
  }
  return false;
}

export default function DailyRangeCalendar({ minDate, maxDate, minUnits, maxUnits, from, to, unavailableDates = [], onChange }: Props) {
  const min = parseDay(minDate);
  const max = parseDay(maxDate);
  const unavailable = useMemo(() => new Set(unavailableDates), [unavailableDates]);
  const [cursor, setCursor] = useState(() => startOfMonth(from ? parseDay(from) : min));

  useEffect(() => {
    if (from) setCursor(startOfMonth(parseDay(from)));
  }, [from]);

  const maxCursor = startOfMonth(max);
  const canPrev = cursor.getTime() > startOfMonth(min).getTime();
  const canNext = addMonths(cursor, 1).getTime() <= maxCursor.getTime();

  const selectionHint = useMemo(() => {
    if (!from) return "Wybierz dzień rozpoczęcia";
    if (!to) return `Teraz wybierz zakończenie · min. ${minUnits} dni, maks. ${maxUnits} dni`;
    const units = diffDays(from, to);
    return `${shortFmt.format(parseDay(from))} → ${shortFmt.format(parseDay(to))} · ${units} ${units === 1 ? "dzień" : "dni"}`;
  }, [from, to, minUnits, maxUnits]);

  function select(value: string) {
    if (!from || to) {
      if (unavailable.has(value)) return;
      onChange(value, "");
      return;
    }
    if (value <= from) {
      if (unavailable.has(value)) return;
      onChange(value, "");
      return;
    }
    const units = diffDays(from, value);
    if (units < minUnits || units > maxUnits) return;
    if (rangeHitsUnavailable(from, value, unavailable)) return;
    onChange(from, value);
  }

  function renderMonth(month: Date) {
    const gridStart = startOfCalendar(month);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const maxEnd = from && !to ? addDays(parseDay(from), maxUnits) : null;
    const minEnd = from && !to ? addDays(parseDay(from), minUnits) : null;

    return <div className="min-w-0">
      <div className="mb-3 text-center font-semibold capitalize">{monthFmt.format(month)}</div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold" style={{ color: "var(--mut)" }}>
        {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const value = key(d);
          const sameMonth = d.getMonth() === month.getMonth();
          const outside = d < min || d > max;
          const occupied = unavailable.has(value);
          const tooShortOrLong = Boolean(from && !to && value > from && ((minEnd && d < minEnd) || (maxEnd && d > maxEnd)));
          const crossesOccupiedNight = Boolean(from && !to && value > from && rangeHitsUnavailable(from, value, unavailable));
          const isFrom = value === from;
          const isTo = value === to;
          const inRange = Boolean(from && to && value > from && value < to);

          let finalDisabled = !sameMonth || outside;
          if (!finalDisabled) {
            if (!from || to) finalDisabled = occupied;
            else if (value <= from) finalDisabled = occupied;
            else finalDisabled = tooShortOrLong || crossesOccupiedNight;
          }

          const checkoutOnOccupiedDay = Boolean(from && !to && value > from && occupied && !finalDisabled);
          const aria = `${d.toLocaleDateString("pl-PL")}${occupied ? checkoutOnOccupiedDay ? ", zajęty od tego dnia, możliwy zwrot" : ", zajęty" : ""}`;
          return <button
            key={value}
            type="button"
            disabled={finalDisabled}
            onClick={() => select(value)}
            aria-label={aria}
            title={occupied ? checkoutOnOccupiedDay ? "Zajęty od tego dnia · możesz zakończyć pobyt tego dnia" : "Termin zajęty" : undefined}
            className="relative h-10 text-sm disabled:cursor-not-allowed"
            style={{ opacity: !sameMonth ? 0 : finalDisabled ? 0.3 : 1 }}
          >
            {inRange && <span className="absolute inset-y-1 left-0 right-0" style={{ background: "rgba(200,150,90,.15)" }} />}
            <span className="relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full font-medium" style={isFrom || isTo ? { background: "var(--gold)", color: "#211406" } : undefined}>{d.getDate()}</span>
            {occupied && !isFrom && !isTo && <span className="absolute bottom-0.5 left-1/2 z-20 h-1 w-4 -translate-x-1/2 rounded-full" style={{ background: checkoutOnOccupiedDay ? "var(--gold)" : "rgba(239,68,68,.75)" }} />}
          </button>;
        })}
      </div>
    </div>;
  }

  return <div className="mt-3 overflow-hidden rounded-3xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex items-center justify-between gap-3 border-b px-3 py-3 sm:px-4" style={{ borderColor: "var(--line)" }}>
      <button type="button" disabled={!canPrev} onClick={() => setCursor(addMonths(cursor, -1))} className="grid h-10 w-10 place-items-center rounded-xl disabled:opacity-25" style={{ border: "1px solid var(--line)" }} aria-label="Poprzedni miesiąc">←</button>
      <div className="text-center"><div className="text-sm font-semibold">{selectionHint}</div><div className="mt-0.5 text-[11px]" style={{ color: "var(--mut)" }}>Kliknij datę początkową, a potem końcową</div></div>
      <button type="button" disabled={!canNext} onClick={() => setCursor(addMonths(cursor, 1))} className="grid h-10 w-10 place-items-center rounded-xl disabled:opacity-25" style={{ border: "1px solid var(--line)" }} aria-label="Następny miesiąc">→</button>
    </div>
    <div className="p-3 sm:p-4">
      <div className="grid gap-6 md:grid-cols-2">
        {renderMonth(cursor)}
        <div className="hidden md:block">{renderMonth(addMonths(cursor, 1))}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}>
        <span><span style={{ color: "rgba(239,68,68,.9)" }}>●</span> zajęte / niedostępne</span>
        <span><span style={{ color: "var(--gold)" }}>●</span> możliwy dzień zwrotu</span>
      </div>
      {(from || to) && <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
        <div className="rounded-2xl px-4 py-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-[11px]" style={{ color: "var(--mut)" }}>POCZĄTEK</div><div className="mt-1 font-semibold">{from ? parseDay(from).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long" }) : "Wybierz"}</div></div>
        <div className="rounded-2xl px-4 py-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-[11px]" style={{ color: "var(--mut)" }}>KONIEC</div><div className="mt-1 font-semibold">{to ? parseDay(to).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long" }) : "Wybierz datę końcową"}</div></div>
      </div>}
    </div>
  </div>;
}
