import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  operational_status: "available" | "occupied" | "service" | "failure" | "blocked" | "inactive" | string;
  current_booking_id: string | null;
  current_title: string | null;
  current_starts_at: string | null;
  current_ends_at: string | null;
  next_booking_id: string | null;
  next_title: string | null;
  next_starts_at: string | null;
  next_ends_at: string | null;
};

const kindLabel: Record<string, string> = {
  staff: "Pracownik",
  vehicle: "Pojazd",
  property: "Nieruchomość",
  room: "Pokój",
  equipment: "Sprzęt",
  other: "Zasób",
};

const statusLabel: Record<string, string> = {
  available: "Dostępny",
  occupied: "W użyciu",
  service: "Serwis",
  failure: "Awaria",
  blocked: "Blokada",
  inactive: "Wyłączony",
};

const statusColor: Record<string, string> = {
  available: "var(--green)",
  occupied: "var(--gold)",
  service: "#f59e0b",
  failure: "#f87171",
  blocked: "#c084fc",
  inactive: "var(--mut)",
};

function dt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
    {hint && <div className="mt-1 text-[11px]" style={{ color: "var(--mut)" }}>{hint}</div>}
  </div>;
}

export default function SellerResourceOperationsDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.schema("market").rpc("seller_resource_operations_dashboard");
    if (error) setError(error.message);
    else {
      setError("");
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); const timer = window.setInterval(load, 60000); return () => window.clearInterval(timer); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    occupied: rows.filter((r) => r.operational_status === "occupied").length,
    available: rows.filter((r) => r.operational_status === "available").length,
    service: rows.filter((r) => r.operational_status === "service").length,
    failure: rows.filter((r) => r.operational_status === "failure").length,
    blocked: rows.filter((r) => r.operational_status === "blocked" || r.operational_status === "inactive").length,
  }), [rows]);

  const current = rows.filter((r) => r.operational_status !== "available");
  const upcoming = rows
    .filter((r) => r.next_booking_id && r.next_starts_at)
    .sort((a, b) => new Date(a.next_starts_at!).getTime() - new Date(b.next_starts_at!).getTime())
    .slice(0, 8);

  return <section className="mb-6 rounded-3xl p-5 sm:p-6" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-semibold tracking-[.16em]" style={{ color: "var(--gold)" }}>DZISIAJ · OPERACJE</div>
        <h2 className="mt-1 text-2xl font-semibold">Flota i zasoby</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Bieżące użycie, awarie, serwis i najbliższe rezerwacje w jednym widoku.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={load} disabled={loading} className="rounded-xl px-3 py-2 text-sm disabled:opacity-50" style={{ border: "1px solid var(--line)" }}>{loading ? "Odświeżam…" : "Odśwież"}</button>
        <Link to="/sprzedawca/rezerwacje/grafiki" className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Zarządzaj zasobami</Link>
      </div>
    </div>

    {error && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.10)", color: "#fca5a5" }}>{error}</div>}

    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Stat label="Wszystkie" value={stats.total} />
      <Stat label="W użyciu" value={stats.occupied} hint="aktywna rezerwacja teraz" />
      <Stat label="Wolne" value={stats.available} />
      <Stat label="Serwis" value={stats.service} />
      <Stat label="Awaria" value={stats.failure} />
      <Stat label="Blokada / wyłączone" value={stats.blocked} />
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <div>
        <h3 className="font-semibold">Stan bieżący</h3>
        <div className="mt-3 space-y-2">
          {current.length === 0 && <div className="rounded-xl p-4 text-sm" style={{ background: "var(--glass)", color: "var(--mut)" }}>Wszystkie aktywne zasoby są teraz dostępne.</div>}
          {current.slice(0, 10).map((r) => <div key={r.id} className="rounded-xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to={`/sprzedawca/rezerwacje/grafiki?resource=${encodeURIComponent(r.id)}`} className="font-semibold hover:underline">{r.name}</Link>
                <div className="text-xs" style={{ color: "var(--mut)" }}>{kindLabel[r.kind] || r.kind}</div>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: statusColor[r.operational_status] || "var(--mut)", border: "1px solid var(--line)" }}>{statusLabel[r.operational_status] || r.operational_status}</span>
            </div>
            {r.current_booking_id && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Teraz: <Link to={`/sprzedawca/rezerwacje#booking-${r.current_booking_id}`} className="underline">{r.current_title || "Rezerwacja"}</Link> · do {dt(r.current_ends_at)}</div>}
          </div>)}
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Najbliższe rezerwacje i zwroty</h3>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <div className="rounded-xl p-4 text-sm" style={{ background: "var(--glass)", color: "var(--mut)" }}>Brak zaplanowanych rezerwacji dla zasobów.</div>}
          {upcoming.map((r) => <div key={`${r.id}-${r.next_booking_id}`} className="rounded-xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <Link to={`/sprzedawca/rezerwacje/grafiki?resource=${encodeURIComponent(r.id)}`} className="font-semibold hover:underline">{r.name}</Link>
                <div className="text-xs" style={{ color: "var(--mut)" }}>{r.next_title || "Rezerwacja"}</div>
              </div>
              <div className="text-right text-xs"><div><b>{dt(r.next_starts_at)}</b></div><div style={{ color: "var(--mut)" }}>zwrot / koniec: {dt(r.next_ends_at)}</div></div>
            </div>
          </div>)}
        </div>
      </div>
    </div>
  </section>;
}
