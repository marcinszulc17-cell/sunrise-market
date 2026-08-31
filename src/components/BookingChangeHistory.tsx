import { useState } from "react";
import { supabase } from "../lib/supabase";

type ChangeRow = {
  id: string;
  change_type: "rescheduled" | "resource_changed" | "rescheduled_and_resource_changed";
  old_starts_at: string;
  old_ends_at: string;
  new_starts_at: string;
  new_ends_at: string;
  old_resource_id: string | null;
  old_resource_name: string | null;
  new_resource_id: string | null;
  new_resource_name: string | null;
  locked_amount_gross: number;
  price_policy: string;
  created_at: string;
};

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });
const pln = (value: number) => Number(value || 0).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });

const changeLabel: Record<ChangeRow["change_type"], string> = {
  rescheduled: "Zmieniono termin",
  resource_changed: "Zmieniono zasób",
  rescheduled_and_resource_changed: "Zmieniono termin i zasób",
};

export default function BookingChangeHistory({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || loaded) return;

    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("seller_booking_change_history", { p_booking: bookingId });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setRows((data || []) as ChangeRow[]);
      setLoaded(true);
    }
    setLoading(false);
  }

  return <div className="w-full sm:w-auto">
    <button type="button" onClick={toggle} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>
      {open ? "▴ Ukryj historię" : "🕘 Historia zmian"}
    </button>

    {open && <div className="mt-3 w-full rounded-2xl p-4 sm:min-w-[520px]" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Historia zmian rezerwacji</div>
          <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Każda zmiana terminu lub przypisanego zasobu. Cena pozostaje zgodna z warunkami z momentu rezerwacji.</div>
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "rgba(200,150,90,.10)", color: "var(--gold)" }}>AUDYT</span>
      </div>

      {loading && <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Pobieram historię…</div>}
      {!loading && error && <div className="mt-4 rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.22)", color: "#fca5a5" }}>Nie udało się pobrać historii: {error}</div>}
      {!loading && !error && loaded && rows.length === 0 && <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Ta rezerwacja nie była jeszcze przenoszona.</div>}

      {!loading && rows.length > 0 && <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const timeChanged = row.change_type !== "resource_changed";
          const resourceChanged = row.change_type !== "rescheduled";
          return <div key={row.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>{changeLabel[row.change_type] || row.change_type}</b>
              <span className="text-xs" style={{ color: "var(--mut)" }}>{dt(row.created_at)}</span>
            </div>

            {timeChanged && <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg px-3 py-2" style={{ background: "var(--header)" }}><div className="text-[10px] font-semibold tracking-[.1em]" style={{ color: "var(--mut)" }}>BYŁO</div><div className="mt-1">{dt(row.old_starts_at)}</div></div>
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(122,184,154,.08)" }}><div className="text-[10px] font-semibold tracking-[.1em]" style={{ color: "var(--green)" }}>JEST</div><div className="mt-1">{dt(row.new_starts_at)}</div></div>
            </div>}

            {resourceChanged && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>
              Zasób: <span style={{ color: "var(--ink)" }}>{row.old_resource_name || "bez przypisania"}</span> → <span style={{ color: "var(--gold)" }}>{row.new_resource_name || "bez przypisania"}</span>
            </div>}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--mut)" }}>
              <span>Polityka ceny: 🔒 zablokowana przy rezerwacji</span>
              <b style={{ color: "var(--ink)" }}>{pln(row.locked_amount_gross)}</b>
            </div>
          </div>;
        })}
      </div>}
    </div>}
  </div>;
}
