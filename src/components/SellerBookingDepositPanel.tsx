import { useEffect, useState } from "react";
import { settleBookingDeposit } from "../lib/bookingDeposit";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type DepositBooking = {
  id: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  status: string;
  deposit_gross: number;
  deposit_status: string;
};

const depositStatusLabel: Record<string, string> = {
  held: "Pobrana", refunding: "Zwrot w toku", refunded: "Zwrócona",
  retaining: "Rozliczenie w toku", retained: "Zatrzymana", failed: "Wymaga ponowienia",
};

export default function SellerBookingDepositPanel() {
  const [rows, setRows] = useState<DepositBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const { data, error } = await supabase.schema("market").rpc("seller_booking_dashboard_v2");
      if (error) throw error;
      setRows(((data ?? []) as DepositBooking[]).filter((row) => Number(row.deposit_gross || 0) > 0));
    } catch (error) { setMsg((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);

  async function refund(row: DepositBooking) {
    if (!window.confirm(`Zwrócić klientowi kaucję ${zl(Number(row.deposit_gross))} za „${row.title}”?`)) return;
    setBusyId(row.id); setMsg(null);
    try { await settleBookingDeposit(row.id, "refund"); setMsg("Kaucja została zwrócona klientowi. ✅"); await reload(); }
    catch (error) { setMsg((error as Error).message); }
    finally { setBusyId(null); }
  }

  async function retain(row: DepositBooking) {
    const note = window.prompt("Podaj powód zatrzymania kaucji:");
    if (note === null) return;
    if (!note.trim()) { setMsg("Podaj powód zatrzymania kaucji."); return; }
    if (!window.confirm(`Zatrzymać kaucję ${zl(Number(row.deposit_gross))}?`)) return;
    setBusyId(row.id); setMsg(null);
    try { await settleBookingDeposit(row.id, "retain", note.trim()); setMsg("Kaucja została rozliczona na rzecz sprzedawcy. ✅"); await reload(); }
    catch (error) { setMsg((error as Error).message); }
    finally { setBusyId(null); }
  }

  const pending = rows.filter((row) => ["held", "failed", "refunding", "retaining"].includes(row.deposit_status));
  const resolved = rows.filter((row) => ["refunded", "retained"].includes(row.deposit_status)).slice(0, 8);

  if (loading && rows.length === 0) return <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Sprawdzam kaucje…</div>;
  if (!loading && rows.length === 0) return null;

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>ROZLICZENIA</div><h2 className="mt-1 text-lg font-semibold">Kaucje</h2><p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>Kaucja jest pobierana razem z rezerwacją, ale nie nalicza cashbacku ani prowizji.</p></div><span className="rounded-full px-2 py-1 text-[10px]" style={{ background: "var(--header)", color: "var(--mut)" }}>{pending.length} do rozliczenia</span></div>
    {msg && <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>{msg}</div>}
    <div className="mt-4 space-y-3">
      {pending.map((row) => {
        const busy = busyId === row.id || ["refunding", "retaining"].includes(row.deposit_status);
        const canRefund = ["cancelled", "completed", "no_show"].includes(row.status) && ["held", "failed"].includes(row.deposit_status);
        const canRetain = ["completed", "no_show"].includes(row.status) && ["held", "failed"].includes(row.deposit_status);
        return <div key={row.id} className="rounded-xl p-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{row.title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{row.status}</div></div><div className="text-right"><div className="font-semibold" style={{ color: "var(--gold)" }}>{zl(Number(row.deposit_gross))}</div><div className="text-[10px]" style={{ color: "var(--mut)" }}>{depositStatusLabel[row.deposit_status] || row.deposit_status}</div></div></div>{(canRefund || canRetain) && <div className="mt-3 flex flex-wrap gap-2">{canRefund && <button disabled={busy} onClick={() => refund(row)} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line)" }}>Zwróć kaucję</button>}{canRetain && <button disabled={busy} onClick={() => retain(row)} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>Zatrzymaj kaucję</button>}</div>}</div>;
      })}
      {pending.length === 0 && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", color: "var(--mut)" }}>Brak kaucji oczekujących na rozliczenie.</div>}
    </div>
    {resolved.length > 0 && <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}><div className="mb-2 text-xs font-semibold" style={{ color: "var(--mut)" }}>Ostatnio rozliczone</div>{resolved.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 text-xs"><span className="truncate">{row.title}</span><span>{depositStatusLabel[row.deposit_status]} · {zl(Number(row.deposit_gross))}</span></div>)}</div>}
  </div>;
}
