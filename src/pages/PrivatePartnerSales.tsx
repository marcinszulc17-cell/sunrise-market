import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Sale = {
  task_id: string;
  order_id: string;
  order_status: string;
  task_status: string;
  created_at: string;
  title: string;
  qty: number;
  unit_price_gross: number;
  payout_gross: number;
  delivery_mode: "shipping" | "pickup";
  buyer_name: string | null;
  buyer_phone: string | null;
  ship_street: string | null;
  ship_city: string | null;
  ship_postal: string | null;
  ship_country: string | null;
  tracking_no: string | null;
};

type SaleEvent = { event_type: string; details: Record<string, unknown>; created_at: string };

const EVENT_LABELS: Record<string, { icon: string; label: string }> = {
  paid: { icon: "💳", label: "Zamówienie opłacone" },
  seller_seen: { icon: "👀", label: "Sprzedający otworzył sprzedaż" },
  shipped: { icon: "📦", label: "Oznaczono jako wysłane" },
  handed_over: { icon: "🤝", label: "Produkt przekazano kupującemu" },
  buyer_notified: { icon: "🔔", label: "Kupujący otrzymał powiadomienie" },
};

function taskLabel(s: Sale) {
  if (s.task_status === "shipped") return "Wysłane";
  if (s.task_status === "handed_over") return "Przekazane";
  return s.delivery_mode === "pickup" ? "Do przekazania" : "Do wysyłki";
}

export default function PrivatePartnerSales() {
  const [rows, setRows] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, SaleEvent[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase.rpc("private_partner_sales");
    if (error) setMsg(error.message);
    else setRows((data ?? []) as Sale[]);
    setLoading(false);
  }

  useEffect(() => {
    void supabase.rpc("mark_new_sale_notifications_read");
    void supabase.rpc("mark_private_sales_seen");
    void reload();
  }, []);

  const stats = useMemo(() => ({
    pending: rows.filter(r => !["shipped","handed_over"].includes(r.task_status)).length,
    done: rows.filter(r => ["shipped","handed_over"].includes(r.task_status)).length,
    payout: rows.reduce((a, r) => a + Number(r.payout_gross || 0), 0),
  }), [rows]);

  async function loadHistory(taskId: string, force = false) {
    if (!force && events[taskId]) return;
    setHistoryLoading(taskId);
    const { data, error } = await supabase.rpc("private_partner_sale_events", { p_task: taskId });
    if (error) setMsg(error.message);
    else setEvents(prev => ({ ...prev, [taskId]: (data ?? []) as SaleEvent[] }));
    setHistoryLoading(null);
  }

  async function toggleHistory(taskId: string) {
    if (openHistory === taskId) { setOpenHistory(null); return; }
    setOpenHistory(taskId);
    await loadHistory(taskId);
  }

  async function setStatus(row: Sale, action: "ship" | "hand_over") {
    setBusy(row.task_id); setMsg(null);
    try {
      const { data, error } = await supabase.rpc("private_partner_set_fulfillment", {
        p_task: row.task_id,
        p_action: action,
        p_tracking: action === "ship" ? (tracking[row.task_id] || null) : null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Nie udało się zmienić statusu.");
      await Promise.all([reload(), loadHistory(row.task_id, true)]);
      setMsg(action === "ship" ? "Sprzedaż oznaczona jako wysłana. ✅" : "Sprzedaż oznaczona jako przekazana kupującemu. ✅");
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  }

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/sprzedawca" className="text-sm" style={{ color: "var(--mut)" }}>← Panel Partnera Handlowego</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Moje sprzedaże</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Tylko opłacone zakupy. Każda pozycja ma własny status realizacji i historię zdarzeń.</p>
        </div>
        <Link to="/sprzedawca/oferty" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Moje ogłoszenia</Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Do realizacji" value={String(stats.pending)} />
        <Stat label="Zrealizowane" value={String(stats.done)} />
        <Stat label="Twoje rozliczenie" value={zl(stats.payout)} />
      </div>

      {msg && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{msg}</div>}

      {loading ? <p>Ładowanie sprzedaży…</p> : rows.length === 0 ? <div className="rounded-2xl p-8 text-center" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-4xl">🛍️</div><h2 className="mt-3 text-xl font-semibold">Nie masz jeszcze sprzedaży</h2><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Gdy klient opłaci zakup, pojawi się tutaj automatycznie.</p></div> : <div className="space-y-4">
        {rows.map(row => {
          const done = ["shipped","handed_over"].includes(row.task_status);
          const pickup = row.delivery_mode === "pickup";
          const history = events[row.task_id] ?? [];
          return <article key={row.task_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs" style={{ color: "var(--mut)" }}>Zamówienie {row.order_id.slice(0,8)} · {new Date(row.created_at).toLocaleDateString("pl-PL")}</div>
                <h2 className="mt-1 text-lg font-semibold">{row.title}</h2>
                <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{row.qty} szt. · {zl(row.unit_price_gross)} / szt.</div>
              </div>
              <div className="text-right"><div className="text-sm font-semibold">{pickup ? "🤝 Odbiór osobisty" : "📦 Wysyłka"}</div><div className="mt-1 text-xs" style={{ color: done ? "var(--green)" : "var(--gold)" }}>{taskLabel(row)}</div></div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl p-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
                <div className="text-xs mb-1" style={{ color: "var(--mut)" }}>Kupujący</div>
                <div className="font-medium">{row.buyer_name || "Klient MySunrise"}</div>
                {row.buyer_phone && <a href={`tel:${row.buyer_phone}`} className="mt-1 block text-sm underline">{row.buyer_phone}</a>}
                {!pickup && <div className="mt-2 text-sm leading-5">{row.ship_street}<br/>{row.ship_postal} {row.ship_city}{row.ship_country ? <><br/>{row.ship_country}</> : null}</div>}
                {pickup && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Przekaż produkt po potwierdzeniu tożsamości kupującego.</div>}
              </div>

              <div className="rounded-xl p-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
                <div className="text-xs" style={{ color: "var(--mut)" }}>Twoje rozliczenie</div>
                <div className="mt-1 font-display text-xl font-semibold">{zl(row.payout_gross)}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Płatność klienta została potwierdzona przed utworzeniem tej sprzedaży.</div>
              </div>
            </div>

            {!done && <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              {pickup ? <button disabled={busy===row.task_id} onClick={() => setStatus(row,"hand_over")} className="rounded-xl px-5 py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>✓ Przekazane kupującemu</button> : <div className="flex flex-wrap gap-2"><input value={tracking[row.task_id] ?? ""} onChange={e => setTracking({ ...tracking, [row.task_id]: e.target.value })} placeholder="Nr przesyłki (opcjonalnie)" className="min-w-[220px] flex-1 rounded-xl px-3 py-2.5 outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)" }}/><button disabled={busy===row.task_id} onClick={() => setStatus(row,"ship")} className="rounded-xl px-5 py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>📦 Oznacz jako wysłane</button></div>}
            </div>}
            {done && row.tracking_no && <div className="mt-3 text-xs" style={{ color: "var(--mut)" }}>Nr przesyłki: {row.tracking_no}</div>}

            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <button onClick={() => toggleHistory(row.task_id)} className="text-sm font-semibold" style={{ color: "var(--gold)" }}>{openHistory === row.task_id ? "Ukryj historię" : "Historia sprzedaży"} →</button>
              {openHistory === row.task_id && <div className="mt-4 space-y-3">
                {historyLoading === row.task_id ? <div className="text-sm" style={{ color: "var(--mut)" }}>Ładowanie historii…</div> : history.length === 0 ? <div className="text-sm" style={{ color: "var(--mut)" }}>Brak zapisanych zdarzeń.</div> : history.map((event, idx) => {
                  const meta = EVENT_LABELS[event.event_type] ?? { icon: "•", label: event.event_type };
                  const trackingNo = typeof event.details?.tracking_no === "string" ? event.details.tracking_no : null;
                  return <div key={`${event.event_type}-${event.created_at}-${idx}`} className="flex gap-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{meta.icon}</div>
                    <div className="min-w-0 flex-1 border-b pb-3" style={{ borderColor: "var(--line)" }}>
                      <div className="text-sm font-medium">{meta.label}</div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{new Date(event.created_at).toLocaleString("pl-PL")}{trackingNo ? ` · nr przesyłki ${trackingNo}` : ""}</div>
                    </div>
                  </div>;
                })}
              </div>}
            </div>
          </article>;
        })}
      </div>}
    </main>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 font-display text-2xl font-semibold">{value}</div></div>;
}
