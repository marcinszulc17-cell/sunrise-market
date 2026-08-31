import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { amiOperator } from "../lib/api";
import { supabase } from "../lib/supabase";

 type RefundException = {
  booking_id: string;
  order_id: string;
  refund_status: string;
  amount_gross: number;
  payment_provider: string;
  external_ref?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  refunded_at?: string | null;
  booking_status: string;
  starts_at: string;
  ends_at: string;
  offer_title?: string | null;
  seller_email?: string | null;
};

const money = (value: number) => `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const dateTime = (value: string) => new Date(value).toLocaleString("pl-PL");

const LABELS: Record<string, string> = {
  blocked_bonus: "Bonusy wykorzystane — ręczne rozliczenie",
  payment_failed: "Zwrot płatności nieudany",
  finalize_failed: "Płatność zwrócona — finalizacja wymaga naprawy",
  preparing: "Refund utknął w przygotowaniu",
};

const NOTES: Record<string, string> = {
  blocked_bonus: "Automatyczny zwrot został zatrzymany przed oddaniem pieniędzy, bo cashback lub prowizja z tego zamówienia została już wykorzystana. Nie wykonuj zwrotu bez ręcznego rozliczenia bonusów.",
  payment_failed: "Zwrot płatności nie doszedł do skutku. System przywrócił wcześniej cofnięte bonusy. Sprawdź błąd operatora płatności przed ponowieniem.",
  finalize_failed: "Zwrot pieniędzy mógł już zostać wykonany. Nie wysyłaj drugiego zwrotu. Trzeba dokończyć wyłącznie finalizację stanu rezerwacji/rozliczeń.",
  preparing: "Proces nie zakończył się przez co najmniej 15 minut. Sprawdź logi i stan płatności przed jakąkolwiek ręczną operacją.",
};

export default function OperatorBookingRefundExceptions() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isOp, setIsOp] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RefundException[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.schema("market").rpc("operator_booking_refund_exceptions");
      if (error) throw error;
      setRows((data ?? []) as RefundException[]);
    } catch (error) {
      setMsg((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      const operator = await amiOperator().catch(() => false);
      setIsOp(operator);
      if (operator) await load();
    });
  }, []);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter((row) => row.refund_status === filter), [rows, filter]);

  if (authed === false) return <Shell><p>Zaloguj się, aby wejść do back-office. <Link to="/login" className="underline">Logowanie</Link></p></Shell>;
  if (authed === null || isOp === null) return <Shell><p>Ładowanie…</p></Shell>;
  if (!isOp) return <Shell><p>Brak uprawnień operatora. <Link to="/" className="underline">Wróć do sklepu</Link></p></Shell>;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/operator" className="text-sm" style={{ color: "var(--mut)" }}>← Back-office</Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Wyjątki refundów rezerwacji</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--mut)" }}>Tylko przypadki, których automat nie może bezpiecznie zakończyć. Ta strona nie wykonuje ręcznych zwrotów — pokazuje dokładny stan, żeby uniknąć podwójnej wypłaty lub pozostawienia bonusów po refundzie.</p>
      </div>
      <button onClick={load} disabled={loading} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line)", background: "var(--glass)" }}>{loading ? "Odświeżam…" : "Odśwież"}</button>
    </div>

    <div className="mb-5 flex flex-wrap gap-2">
      {[['all','Wszystkie'],['blocked_bonus','Bonusy wykorzystane'],['payment_failed','Błąd płatności'],['finalize_failed','Błąd finalizacji'],['preparing','Utknęło']].map(([value,label]) => <button key={value} onClick={()=>setFilter(value)} className="rounded-full px-3 py-1.5 text-xs" style={filter === value ? { background: "rgba(200,150,90,.18)", border: "1px solid rgba(200,150,90,.55)", color: "var(--gold)" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>{label}</button>)}
      <span className="self-center text-xs" style={{ color: "var(--mut)" }}>{visible.length} przypadków</span>
    </div>

    {msg && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(242,92,176,.10)", border: "1px solid rgba(242,92,176,.3)", color: "#F8A8D2" }}>{msg}</div>}

    <div className="space-y-3">
      {visible.map((row) => <div key={row.booking_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: row.refund_status === "finalize_failed" ? "1px solid rgba(242,92,176,.55)" : "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-[.1em]" style={{ color: row.refund_status === "finalize_failed" ? "#F8A8D2" : "var(--gold)" }}>{LABELS[row.refund_status] ?? row.refund_status}</div>
            <div className="mt-1 text-lg font-semibold">{row.offer_title || "Rezerwacja"} · {money(row.amount_gross)}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Sprzedawca: {row.seller_email || "—"} · płatność: {row.payment_provider || "—"} · termin: {dateTime(row.starts_at)}</div>
          </div>
          <div className="text-right text-xs" style={{ color: "var(--mut)" }}>
            <div>Aktualizacja: {dateTime(row.updated_at)}</div>
            <div>Booking: <span className="font-mono">{row.booking_id.slice(0,8)}</span> · Zam.: <span className="font-mono">{row.order_id.slice(0,8)}</span></div>
          </div>
        </div>
        <div className="mt-4 rounded-xl p-3 text-sm leading-6" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{NOTES[row.refund_status] ?? "Wymagana kontrola operatora."}</div>
        {row.last_error && <div className="mt-3 rounded-xl p-3 font-mono text-xs break-words" style={{ background: "rgba(242,92,176,.07)", color: "#F8A8D2", border: "1px solid rgba(242,92,176,.2)" }}>{row.last_error}</div>}
        {row.external_ref && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Referencja operatora płatności: <span className="font-mono">{row.external_ref}</span></div>}
      </div>)}
      {!loading && visible.length === 0 && <div className="rounded-2xl p-8 text-center" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Brak wyjątków refundu wymagających interwencji. ✅</div>}
    </div>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>;
}