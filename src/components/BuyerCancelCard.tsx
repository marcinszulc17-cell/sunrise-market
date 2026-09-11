// Anulowanie rezerwacji przez gościa — według polityki wybranej przez właściciela.
//
// Kwotę liczy baza (market.booking_cancellation_quote) i to samo wyliczenie wykonuje
// zwrot, więc liczba na ekranie jest tą, którą gość naprawdę dostanie. Pokazujemy ją
// PRZED kliknięciem, razem z tym, co przepada — nikt nie powinien dowiadywać się
// o potrąceniu dopiero po anulowaniu.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Quote = {
  policy: string; refund_pct: number; refund_amount_gross: number;
  deposit_gross: number; total_back_gross: number; days_before: number;
  can_cancel: boolean; reason: string | null;
};

const POLICY_LABEL: Record<string, string> = {
  flexible: "Elastyczna", moderate: "Umiarkowana", strict: "Ścisła", non_refundable: "Bezzwrotna",
};

const zl = (n: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(n) || 0);

export default function BuyerCancelCard({ bookingId, rentGross, onDone }: { bookingId: string; rentGross: number; onDone: () => void }) {
  const [q, setQ] = useState<Quote | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const { data } = await supabase.schema("market").rpc("booking_cancellation_quote", { p_booking: bookingId });
      if (!dead) setQ(((data as Quote[]) ?? [])[0] ?? null);
    })().catch(() => {});
    return () => { dead = true; };
  }, [bookingId]);

  if (!q || !q.can_cancel) return null;

  // Przepada wyłącznie część czynszu zatrzymana zgodnie z polityką — opłata za
  // sprzątanie i kaucja wracają, bo dotyczą pobytu, który się nie odbędzie.
  const lost = Math.round(Number(rentGross || 0) * (100 - Number(q.refund_pct || 0))) / 100;

  async function cancel() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke("booking-buyer-cancel", { body: { booking_id: bookingId } });
    if (error) { setMsg(error.message); setBusy(false); return; }
    const r = data as { ok: boolean; error?: string; message?: string; refunded?: number };
    if (!r?.ok) { setMsg(r?.message || r?.error || "Nie udało się anulować rezerwacji"); setBusy(false); return; }
    setMsg(`Rezerwacja anulowana. Zwracamy ${zl(Number(r.refunded ?? 0))} — na portfel Sunrise Pay od razu, na kartę zwykle w 3–7 dni roboczych.`);
    setBusy(false);
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl px-3 py-3 text-xs" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b style={{ color: "var(--ink)" }}>Anulowanie</b>
          <span className="ml-2" style={{ color: "var(--mut)" }}>
            Polityka: {POLICY_LABEL[q.policy] ?? q.policy} · do przyjazdu {q.days_before} dni
          </span>
        </div>
        {!open && <button onClick={() => setOpen(true)} className="rounded-lg px-3 py-1.5 font-semibold" style={{ border: "1px solid var(--line)" }}>Chcę anulować</button>}
      </div>

      {open && (
        <div className="mt-3">
          <div className="grid gap-1" style={{ color: "var(--mut)" }}>
            <div className="flex justify-between"><span>Zwrot czynszu i opłat ({q.refund_pct}%)</span><b style={{ color: "var(--ink)" }}>{zl(q.refund_amount_gross)}</b></div>
            {q.deposit_gross > 0 && <div className="flex justify-between"><span>Kaucja (wraca zawsze)</span><b style={{ color: "var(--ink)" }}>{zl(q.deposit_gross)}</b></div>}
            <div className="flex justify-between border-t pt-1" style={{ borderColor: "var(--line)" }}><span>Razem wróci do Ciebie</span><b style={{ color: "var(--green)" }}>{zl(q.total_back_gross)}</b></div>
            {lost > 0 && <div className="flex justify-between"><span>Zostaje u właściciela</span><b style={{ color: "#F25CB0" }}>{zl(lost)}</b></div>}
          </div>
          <p className="mt-2" style={{ color: "var(--mut)" }}>
            Cashback naliczony za tę rezerwację zostanie cofnięty — pobyt się nie odbędzie. Anulowania nie da się wycofać.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} onClick={cancel} className="rounded-lg px-3 py-2 font-semibold" style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>
              {busy ? "Anuluję…" : `Anuluj i odbierz ${zl(q.total_back_gross)}`}
            </button>
            <button disabled={busy} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2" style={{ border: "1px solid var(--line)" }}>Jednak nie</button>
          </div>
        </div>
      )}

      {msg && <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "rgba(232,137,26,.10)", border: "1px solid rgba(232,137,26,.25)" }}>{msg}</div>}
    </div>
  );
}
