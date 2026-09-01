import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Booking = {
  id: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  status: string;
  paid_at: string | null;
  resource_name?: string | null;
};

type View = "today" | "upcoming";

const activeStatuses = new Set(["held", "pending_payment", "confirmed"]);
const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function SellerBookingTodayPanel() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [view, setView] = useState<View>("today");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("seller_booking_dashboard_v2").then(({ data, error }) => {
      if (!error) setRows((data || []) as Booking[]);
      setLoading(false);
    });
  }, []);

  const now = new Date();
  const todayRows = useMemo(() => rows
    .filter((r) => activeStatuses.has(r.status) && sameLocalDay(new Date(r.starts_at), now))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [rows]);
  const upcomingRows = useMemo(() => rows
    .filter((r) => activeStatuses.has(r.status) && new Date(r.starts_at).getTime() > now.getTime() && !sameLocalDay(new Date(r.starts_at), now))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 8), [rows]);
  const visible = view === "today" ? todayRows : upcomingRows;
  const awaiting = rows.filter((r) => ["held", "pending_payment"].includes(r.status) && !!r.paid_at).length;

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>DZISIAJ I NAJBLIŻSZE</div><h2 className="mt-1 text-lg font-semibold">Plan rezerwacji</h2></div>
      {awaiting > 0 && <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(200,150,90,.15)", color: "var(--gold)" }}>{awaiting} do akceptacji</span>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button onClick={() => setView("today")} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: view === "today" ? "1px solid var(--gold)" : "1px solid var(--line)", color: view === "today" ? "var(--gold)" : "var(--mut)" }}>Dzisiaj ({todayRows.length})</button>
      <button onClick={() => setView("upcoming")} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: view === "upcoming" ? "1px solid var(--gold)" : "1px solid var(--line)", color: view === "upcoming" ? "var(--gold)" : "var(--mut)" }}>Nadchodzące ({upcomingRows.length})</button>
    </div>
    {loading && <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Ładowanie planu…</div>}
    {!loading && visible.length === 0 && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--header)", color: "var(--mut)" }}>{view === "today" ? "Brak aktywnych rezerwacji na dziś." : "Brak kolejnych aktywnych rezerwacji."}</div>}
    <div className="mt-4 space-y-2">
      {visible.map((r) => {
        const awaitingApproval = ["held", "pending_payment"].includes(r.status) && !!r.paid_at;
        return <Link key={r.id} to={`/sprzedawca/rezerwacje#booking-${r.id}`} className="block rounded-xl p-3 text-sm transition hover:-translate-y-px" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-semibold">{r.title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{view === "today" ? time(r.starts_at) : dt(r.starts_at)} · {r.buyer_name || r.buyer_email || "Klient"}</div>{r.resource_name && <div className="mt-1 truncate text-xs" style={{ color: "var(--gold)" }}>{r.resource_name}</div>}</div><span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ border: "1px solid var(--line)", color: awaitingApproval ? "var(--gold)" : r.paid_at ? "var(--green)" : "var(--mut)" }}>{awaitingApproval ? "Do akceptacji" : r.paid_at ? "Opłacona" : "Nieopłacona"}</span></div>
        </Link>;
      })}
    </div>
  </div>;
}
