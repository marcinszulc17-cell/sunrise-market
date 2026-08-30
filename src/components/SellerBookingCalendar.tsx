import { useMemo, useState } from "react";

type BookingEvent = {
  id: string;
  offer_id: string;
  title: string;
  buyer_name: string | null;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type BlockEvent = {
  id: string;
  offer_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type Props = {
  bookings: BookingEvent[];
  blocks: BlockEvent[];
  onPickDate?: (start: Date, end: Date) => void;
};

type View = "month" | "week" | "day";

type CalendarEvent = {
  id: string;
  kind: "booking" | "block";
  title: string;
  subtitle: string;
  startsAt: Date;
  endsAt: Date;
  status?: string;
  bookingId?: string;
};

const DAY = 86400000;
const WEEKDAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const monthFmt = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const js = x.getDay(); const mondayOffset = js === 0 ? -6 : 1 - js; return addDays(x, mondayOffset); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function overlapsDay(e: CalendarEvent, d: Date) { const from = startOfDay(d).getTime(); const to = from + DAY; return e.startsAt.getTime() < to && e.endsAt.getTime() > from; }
function eventTime(e: CalendarEvent) { return `${timeFmt.format(e.startsAt)}–${timeFmt.format(e.endsAt)}`; }
function eventStyle(e: CalendarEvent): React.CSSProperties {
  if (e.kind === "block") return { background: "rgba(148,163,184,.10)", border: "1px dashed rgba(148,163,184,.35)", color: "var(--mut)" };
  if (e.status === "confirmed") return { background: "rgba(34,197,94,.11)", border: "1px solid rgba(34,197,94,.28)" };
  if (e.status === "pending_payment" || e.status === "held") return { background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.30)" };
  if (e.status === "cancelled" || e.status === "expired") return { background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.18)", opacity: .65 };
  return { background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.20)" };
}

export default function SellerBookingCalendar({ bookings, blocks, onPickDate }: Props) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());

  const events = useMemo<CalendarEvent[]>(() => [
    ...bookings.map(b => ({
      id: `booking-${b.id}`,
      kind: "booking" as const,
      title: b.title,
      subtitle: b.buyer_name || "Klient",
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      status: b.status,
      bookingId: b.id,
    })),
    ...blocks.map(b => ({
      id: `block-${b.id}`,
      kind: "block" as const,
      title: b.title,
      subtitle: b.reason || "Blokada terminu",
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
    })),
  ].filter(e => !Number.isNaN(e.startsAt.getTime()) && !Number.isNaN(e.endsAt.getTime())), [bookings, blocks]);

  function move(direction: number) {
    if (view === "day") setCursor(addDays(cursor, direction));
    else if (view === "week") setCursor(addDays(cursor, direction * 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
  }

  function pickDay(day: Date) {
    setCursor(day);
    if (view === "month") setView("day");
    onPickDate?.(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0), new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0));
  }

  const label = view === "month" ? monthFmt.format(cursor) : view === "day" ? dayFmt.format(cursor) : `${shortDayFmt.format(startOfWeek(cursor))} – ${shortDayFmt.format(addDays(startOfWeek(cursor), 6))}`;

  return <section className="mb-6 overflow-hidden rounded-3xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--line)" }}>
      <div>
        <div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>KALENDARZ SPRZEDAWCY</div>
        <h2 className="mt-1 text-xl font-semibold capitalize">{label}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCursor(new Date())} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Dzisiaj</button>
        <button type="button" onClick={() => move(-1)} className="rounded-xl px-3 py-2" style={{ border: "1px solid var(--line)" }} aria-label="Poprzedni okres">←</button>
        <button type="button" onClick={() => move(1)} className="rounded-xl px-3 py-2" style={{ border: "1px solid var(--line)" }} aria-label="Następny okres">→</button>
        <div className="flex rounded-xl p-1" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          {(["month", "week", "day"] as View[]).map(v => <button type="button" key={v} onClick={() => setView(v)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: view === v ? "rgba(200,150,90,.18)" : "transparent", color: view === v ? "var(--gold)" : "var(--mut)" }}>{v === "month" ? "Miesiąc" : v === "week" ? "Tydzień" : "Dzień"}</button>)}
        </div>
      </div>
    </div>

    {view === "month" && <MonthView cursor={cursor} events={events} onPickDay={pickDay} />}
    {view === "week" && <WeekView cursor={cursor} events={events} onPickDay={pickDay} />}
    {view === "day" && <DayView cursor={cursor} events={events} onPickDay={pickDay} />}

    <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>
      <span>● Potwierdzona</span><span style={{ color: "var(--gold)" }}>● Oczekuje / blokada płatności</span><span>▧ Ręczna blokada</span><span>Kliknij rezerwację, aby przejść do szczegółów.</span>
    </div>
  </section>;
}

function MonthView({ cursor, events, onPickDay }: { cursor: Date; events: CalendarEvent[]; onPickDay: (d: Date) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  return <div>
    <div className="grid grid-cols-7 border-b text-center text-[11px] font-semibold" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>{WEEKDAYS.map(d => <div key={d} className="py-2">{d}</div>)}</div>
    <div className="grid grid-cols-7">{days.map(day => {
      const dayEvents = events.filter(e => overlapsDay(e, day)).slice(0, 3);
      const outside = day.getMonth() !== cursor.getMonth();
      return <div key={day.toISOString()} className="min-h-[105px] border-b border-r p-1.5 sm:min-h-[125px] sm:p-2" style={{ borderColor: "var(--line)", opacity: outside ? .45 : 1 }}>
        <button type="button" onClick={() => onPickDay(day)} className="mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold" style={sameDay(day, today) ? { background: "var(--gold)", color: "#211406" } : undefined}>{day.getDate()}</button>
        <div className="space-y-1">{dayEvents.map(e => <CalendarEventChip key={e.id} event={e} compact />)}{events.filter(e => overlapsDay(e, day)).length > 3 && <button type="button" onClick={() => onPickDay(day)} className="text-[10px] underline" style={{ color: "var(--mut)" }}>+{events.filter(e => overlapsDay(e, day)).length - 3} więcej</button>}</div>
      </div>;
    })}</div>
  </div>;
}

function WeekView({ cursor, events, onPickDay }: { cursor: Date; events: CalendarEvent[]; onPickDay: (d: Date) => void }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();
  return <div className="overflow-x-auto"><div className="grid min-w-[900px] grid-cols-7">{days.map(day => {
    const dayEvents = events.filter(e => overlapsDay(e, day)).sort((a,b) => a.startsAt.getTime()-b.startsAt.getTime());
    return <div key={day.toISOString()} className="min-h-[390px] border-r p-3" style={{ borderColor: "var(--line)" }}>
      <button type="button" onClick={() => onPickDay(day)} className="mb-3 w-full rounded-xl p-2 text-center" style={sameDay(day,today) ? { background:"rgba(200,150,90,.14)", border:"1px solid rgba(200,150,90,.28)" } : { border:"1px solid var(--line)" }}><div className="text-xs" style={{ color:"var(--mut)" }}>{day.toLocaleDateString("pl-PL",{weekday:"short"})}</div><div className="text-xl font-semibold">{day.getDate()}</div></button>
      <div className="space-y-2">{dayEvents.length ? dayEvents.map(e => <CalendarEventChip key={e.id} event={e} />) : <div className="rounded-xl p-3 text-xs" style={{ color:"var(--mut)", background:"var(--header)" }}>Brak zdarzeń</div>}</div>
    </div>;
  })}</div></div>;
}

function DayView({ cursor, events, onPickDay }: { cursor: Date; events: CalendarEvent[]; onPickDay: (d: Date) => void }) {
  const dayEvents = events.filter(e => overlapsDay(e, cursor)).sort((a,b) => a.startsAt.getTime()-b.startsAt.getTime());
  return <div className="p-4 sm:p-5">
    <button type="button" onClick={() => onPickDay(cursor)} className="mb-4 rounded-xl px-3 py-2 text-sm" style={{ border:"1px solid var(--line)", color:"var(--gold)" }}>+ Zablokuj godzinę tego dnia</button>
    {dayEvents.length === 0 ? <div className="rounded-2xl p-8 text-center" style={{ background:"var(--header)", color:"var(--mut)" }}>Brak rezerwacji i blokad tego dnia.</div> : <div className="space-y-3">{dayEvents.map(e => <CalendarEventChip key={e.id} event={e} />)}</div>}
  </div>;
}

function CalendarEventChip({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const content = <><div className="truncate font-semibold">{event.kind === "block" ? "▧ " : "● "}{event.title}</div>{!compact && <><div className="mt-1 text-xs" style={{ color:"var(--mut)" }}>{eventTime(event)}</div><div className="mt-1 truncate text-xs" style={{ color:"var(--mut)" }}>{event.subtitle}</div></>}</>;
  if (event.kind === "booking" && event.bookingId) return <a href={`#booking-${event.bookingId}`} className={`block rounded-lg ${compact ? "px-1.5 py-1 text-[10px]" : "p-3 text-sm"}`} style={eventStyle(event)}>{content}</a>;
  return <div className={`rounded-lg ${compact ? "px-1.5 py-1 text-[10px]" : "p-3 text-sm"}`} style={eventStyle(event)}>{content}</div>;
}
