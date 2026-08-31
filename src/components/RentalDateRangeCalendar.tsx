import { useEffect, useMemo, useState } from "react";

type Props = {
  minDay: string;
  maxDay: string;
  fromDay: string;
  toDay: string;
  onChange: (from: string, to: string) => void;
};

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const DAY_MS = 86400000;

function parseDay(value: string) {
  return new Date(`${value}T12:00:00`);
}
function keyOf(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function monthStart(value: string) {
  const d = parseDay(value);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}
function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
}
function mondayIndex(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export default function RentalDateRangeCalendar({ minDay, maxDay, fromDay, toDay, onChange }: Props) {
  const [cursor, setCursor] = useState(() => monthStart(fromDay || minDay));

  useEffect(() => {
    if (fromDay) setCursor(monthStart(fromDay));
  }, [fromDay]);

  const minMonth = monthStart(minDay);
  const maxMonth = monthStart(maxDay);
  const canPrev = cursor.getTime() > minMonth.getTime();
  const canNext = cursor.getTime() < maxMonth.getTime();
  const title = cursor.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = new Date(first.getTime() - mondayIndex(first) * DAY_MS);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, [cursor]);

  function select(day: string) {
    if (day < minDay || day > maxDay) return;
    if (!fromDay || toDay || day <= fromDay) {
      onChange(day, "");
      return;
    }
    onChange(fromDay, day);
  }

  return <div className="mt-3 overflow-hidden rounded-3xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
      <button type="button" disabled={!canPrev} onClick={() => canPrev && setCursor(addMonths(cursor, -1))} className="grid h-9 w-9 place-items-center rounded-xl disabled:opacity-25" style={{ border: "1px solid var(--line)" }} aria-label="Poprzedni miesiąc">←</button>
      <div className="text-center">
        <div className="font-semibold capitalize">{title}</div>
        <div className="text-[11px]" style={{ color: "var(--mut)" }}>{fromDay && !toDay ? "Teraz wybierz dzień zwrotu" : "Kliknij dzień odbioru, potem dzień zwrotu"}</div>
      </div>
      <button type="button" disabled={!canNext} onClick={() => canNext && setCursor(addMonths(cursor, 1))} className="grid h-9 w-9 place-items-center rounded-xl disabled:opacity-25" style={{ border: "1px solid var(--line)" }} aria-label="Następny miesiąc">→</button>
    </div>

    <div className="grid grid-cols-7 px-2 pt-2 text-center text-[11px] font-semibold" style={{ color: "var(--mut)" }}>
      {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
    </div>
    <div className="grid grid-cols-7 gap-y-1 p-2 pt-0">
      {days.map((date) => {
        const key = keyOf(date);
        const outsideMonth = date.getMonth() !== cursor.getMonth();
        const disabled = key < minDay || key > maxDay;
        const start = key === fromDay;
        const end = key === toDay;
        const inRange = Boolean(fromDay && toDay && key > fromDay && key < toDay);
        const selected = start || end;
        return <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => select(key)}
          className="relative h-11 text-sm disabled:cursor-not-allowed"
          style={{ opacity: outsideMonth ? 0.35 : disabled ? 0.2 : 1 }}
          aria-label={date.toLocaleDateString("pl-PL")}
        >
          {(inRange || selected) && <span className="absolute inset-y-1 left-0 right-0" style={{ background: selected ? "rgba(200,150,90,.20)" : "rgba(200,150,90,.10)", borderRadius: start ? "12px 0 0 12px" : end ? "0 12px 12px 0" : undefined }} />}
          <span className="relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full font-medium" style={selected ? { background: "var(--gold)", color: "#211406" } : undefined}>{date.getDate()}</span>
        </button>;
      })}
    </div>

    <div className="grid gap-2 border-t p-3 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
      <div className="rounded-2xl px-3 py-2.5" style={{ background: "var(--header)", border: fromDay ? "1px solid var(--gold)" : "1px solid var(--line)" }}>
        <div className="text-[10px] font-semibold tracking-[.12em]" style={{ color: "var(--mut)" }}>ODBIÓR / OD</div>
        <div className="mt-1 font-semibold">{fromDay ? parseDay(fromDay).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }) : "Wybierz datę"}</div>
      </div>
      <div className="rounded-2xl px-3 py-2.5" style={{ background: "var(--header)", border: toDay ? "1px solid var(--gold)" : "1px solid var(--line)" }}>
        <div className="text-[10px] font-semibold tracking-[.12em]" style={{ color: "var(--mut)" }}>ZWROT / DO</div>
        <div className="mt-1 font-semibold">{toDay ? parseDay(toDay).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }) : fromDay ? "Wybierz datę zwrotu" : "Najpierw wybierz początek"}</div>
      </div>
    </div>
  </div>;
}
