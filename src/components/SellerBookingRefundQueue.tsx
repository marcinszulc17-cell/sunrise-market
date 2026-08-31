import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type PaidBooking = {
  id: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  amount_gross: number;
  status: string;
  paid_at: string | null;
  payment_provider: string | null;
  starts_at: string;
};

const pln = (value: number) => Number(value || 0).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
const when = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });

export default function SellerBookingRefundQueue() {
  const [rows, setRows] = useState<PaidBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("seller_booking_dashboard_v2");
    if (error) setMessage(error.message);
    else setRows((data || []) as PaidBooking[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const refundable = useMemo(() => rows.filter((row) =>
    !!row.paid_at && ["held", "pending_payment", "confirmed"].includes(row.status)
  ), [rows]);

  async function cancelAndRefund(row: PaidBooking) {
    const buyer = row.buyer_name || row.buyer_email || "klienta";
    if (!window.confirm(`Anulować opłaconą rezerwację „${row.title}” i zwrócić ${pln(row.amount_gross)} dla ${buyer}?\n\nSystem najpierw cofnie cashback i prowizje, potem wykona zwrot płatności.`)) return;

    setBusyId(row.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("booking-cancel-refund", {
        body: { booking_id: row.id },
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === "bonus_points_already_used") {
          throw new Error(data?.message || "Punkty z tej rezerwacji zostały już wykorzystane. Zwrot wymaga rozliczenia operatora.");
        }
        throw new Error(data?.message || data?.error || "Nie udało się anulować i zwrócić płatności.");
      }
      setMessage(`Zwrot ${pln(Number(data.refunded ?? row.amount_gross))} wykonany. Rezerwacja została anulowana. ✅`);
      await load();
    } catch (error) {
      setMessage("Zwrot nie został zakończony: " + (error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && refundable.length === 0 && !message) return null;

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid rgba(239,68,68,.22)" }}>
    <div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "#fca5a5" }}>OPŁACONE REZERWACJE</div>
    <h2 className="mt-1 text-lg font-semibold">Anulowanie i zwrot</h2>
    <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>
      Opłaconej rezerwacji nie anulujemy zwykłym przyciskiem. Zwrot cofa cashback i prowizje, oddaje pełną płatność przez Sunrise Pay albo Stripe i zatrzymuje planowaną wypłatę sprzedawcy.
    </p>

    {message && <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{message}</div>}
    {loading && <div className="mt-3 text-sm" style={{ color: "var(--mut)" }}>Sprawdzam opłacone rezerwacje…</div>}

    {!loading && <div className="mt-3 space-y-2">
      {refundable.map((row) => {
        const awaitingApproval = row.status === "pending_payment" && !!row.paid_at;
        const busy = busyId === row.id;
        return <div key={row.id} className="rounded-xl p-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div className="font-semibold text-sm">{row.title}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{row.buyer_name || row.buyer_email || "Klient"} · {when(row.starts_at)}</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span style={{ color: awaitingApproval ? "var(--gold)" : "var(--mut)" }}>{awaitingApproval ? "Opłacona — do akceptacji" : "Opłacona"} · {row.payment_provider || "płatność"}</span>
            <b>{pln(row.amount_gross)}</b>
          </div>
          <button disabled={busy || busyId !== null} onClick={() => cancelAndRefund(row)} className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ border: "1px solid rgba(239,68,68,.45)", color: "#fca5a5" }}>
            {busy ? "Zwracam płatność…" : "Anuluj i zwróć pełną płatność"}
          </button>
        </div>;
      })}
      {refundable.length === 0 && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", color: "var(--mut)" }}>Brak opłaconych aktywnych rezerwacji wymagających anulowania.</div>}
    </div>}
  </div>;
}