import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myOrders, openReturn, myReturns } from "../lib/api";
import InvoiceSnapshotCard, { type InvoiceSnapshot } from "../components/InvoiceSnapshotCard";
import SalesDocumentsPanel from "../components/SalesDocumentsPanel";
import { zl } from "../lib/money";

type Item = { offer_id: string; title: string; qty: number; price: number };
type Order = { order_id: string; status: string; total: number; cashback: number; created_at: string; shipping_method: string | null; tracking_no: string | null; invoice: InvoiceSnapshot; items: Item[] };
type TimelineEvent = { event_type: string; details: Record<string, unknown>; created_at: string };
type ItemTimeline = { task_id: string; offer_id: string; title: string; task_status: string; tracking_no: string | null; events: TimelineEvent[] };

const statusLabel: Record<string, string> = {
  created: "Utworzone", paid: "Opłacone", shipped: "Wysłane",
  delivered: "Dostarczone", completed: "Zakończone", cancelled: "Anulowane", disputed: "Spór",
};
const statusColor: Record<string, string> = {
  paid: "var(--green)", shipped: "#38E0F0", delivered: "#7AB89A", completed: "#7AB89A",
  cancelled: "#F25CB0", disputed: "#F25CB0",
};
const eventLabel: Record<string, { icon: string; label: string }> = {
  paid: { icon: "💳", label: "Płatność potwierdzona" },
  seller_seen: { icon: "👀", label: "Sprzedający zobaczył zamówienie" },
  shipped: { icon: "📦", label: "Sprzedający oznaczył jako wysłane" },
  handed_over: { icon: "🤝", label: "Sprzedający potwierdził przekazanie" },
  delivered: { icon: "✅", label: "Doręczenie potwierdzone" },
  buyer_notified: { icon: "🔔", label: "Wysłaliśmy Ci powiadomienie" },
};

export default function Zamowienia() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [openTimeline, setOpenTimeline] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, ItemTimeline[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    setOrders((await myOrders()) as Order[]);
    const r = (await myReturns()) as { order_id: string; status: string }[];
    setReturns(Object.fromEntries(r.map((x) => [x.order_id, x.status])));
  }
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      await load();
    });
  }, []);

  async function onReturn(id: string) {
    const reason = window.prompt("Powód zwrotu / reklamacji:");
    if (reason === null) return;
    try { await openReturn(id, reason); await load(); } catch (e) { alert((e as Error).message); }
  }

  async function fetchTimeline(orderId: string, force = false) {
    if (!force && timelines[orderId]) return timelines[orderId];
    setTimelineLoading(orderId);
    const { data, error } = await supabase.rpc("my_order_item_timelines", { p_order: orderId });
    if (error) {
      setTimelineLoading(null);
      alert(error.message);
      return [];
    }

    let rows = (data ?? []) as ItemTimeline[];
    const shipped = rows.filter((row) => row.task_status === "shipped");
    if (shipped.length) {
      const checks = await Promise.allSettled(
        shipped.map((row) => supabase.functions.invoke("courier-track-confirm", { body: { task_id: row.task_id } }))
      );
      const anyDelivered = checks.some((result) => result.status === "fulfilled" && result.value.data?.delivered === true);
      if (anyDelivered) {
        const refreshed = await supabase.rpc("my_order_item_timelines", { p_order: orderId });
        if (!refreshed.error) rows = (refreshed.data ?? []) as ItemTimeline[];
        await load();
      }
    }

    setTimelines(prev => ({ ...prev, [orderId]: rows }));
    setTimelineLoading(null);
    return rows;
  }

  async function toggleTimeline(orderId: string) {
    if (openTimeline === orderId) { setOpenTimeline(null); return; }
    setOpenTimeline(orderId);
    await fetchTimeline(orderId);
  }

  async function confirmItem(orderId: string, taskId: string) {
    setConfirming(taskId);
    const { data, error } = await supabase.rpc("buyer_confirm_item_delivery", { p_task: taskId });
    setConfirming(null);
    if (error || !data?.ok) { alert(error?.message ?? data?.message ?? "Nie udało się potwierdzić odbioru."); return; }
    await Promise.all([load(), fetchTimeline(orderId, true)]);
  }

  const retLabel: Record<string, string> = { requested: "Zwrot: w trakcie", approved: "Zwrot: zaakceptowany", refunded: "Zwrot: zwrócono na portfel", rejected: "Zwrot: odrzucony" };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-8 w-auto rounded-lg bg-white p-1" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div className="flex-1" />
          <a href="/portfel" className="text-sm navlink">Portfel</a>
          <a href="/" className="text-sm navlink">← Sklep</a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-6">Moje zamówienia</h1>

        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się, aby zobaczyć zamówienia. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}
        {authed === null && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
        {authed && orders.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień. <a href="/" className="text-amber-400 underline">Zacznij zakupy</a>.</p>}

        <div className="flex flex-col gap-4">
          {orders.map((o) => {
            const orderTimelines = timelines[o.order_id] ?? [];
            return <div key={o.order_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm" style={{ color: "var(--mut)" }}>
                  {new Date(o.created_at).toLocaleString("pl-PL")} · nr {o.order_id.slice(0, 8)}
                </div>
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                      style={{ background: "var(--glass)", border: "1px solid var(--line)", color: statusColor[o.status] ?? "var(--ink)" }}>
                  {statusLabel[o.status] ?? o.status}
                </span>
              </div>
              <div className="flex flex-col gap-1 mb-3">
                {o.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <a href={`/produkt/${it.offer_id}`} className="hover:text-amber-300">{it.title} × {it.qty}</a>
                    <span style={{ color: "var(--mut)" }}>{zl(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>
              {(o.shipping_method || o.tracking_no) && (
                <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>
                  🚚 Dostawa: {o.shipping_method ?? "—"}{o.tracking_no && <> · nr przesyłki <b style={{ color: "var(--ink)" }}>{o.tracking_no}</b></>}
                </div>
              )}
              {o.invoice?.requested && <div className="mb-3"><InvoiceSnapshotCard invoice={o.invoice} compact /></div>}
              <SalesDocumentsPanel orderId={o.order_id} mode="buyer" invoiceRequested={Boolean(o.invoice?.requested)} />
              {returns[o.order_id]
                ? <div className="mb-3 mt-3 text-sm" style={{ color: "var(--gold)" }}>{retLabel[returns[o.order_id]] ?? returns[o.order_id]}</div>
                : (["paid", "shipped", "delivered"].includes(o.status) &&
                    <button onClick={() => onReturn(o.order_id)} className="mb-3 mt-3 text-sm px-4 py-2 rounded-xl"
                            style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zwróć / reklamuj</button>)}

              <div className="mb-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                <button onClick={() => toggleTimeline(o.order_id)} className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                  {openTimeline === o.order_id ? "Ukryj przebieg zamówienia" : "Przebieg zamówienia"} →
                </button>
                {openTimeline === o.order_id && <div className="mt-4">
                  {timelineLoading === o.order_id ? <div className="text-sm" style={{ color: "var(--mut)" }}>Ładowanie przebiegu i statusu kuriera…</div> : orderTimelines.length === 0 ? <div className="text-sm" style={{ color: "var(--mut)" }}>Dla tego zamówienia nie ma jeszcze szczegółowej historii realizacji.</div> : <div className="space-y-4">
                    {orderTimelines.map((tl) => <div key={tl.task_id} className="rounded-xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <a href={`/produkt/${tl.offer_id}`} className="font-semibold hover:text-amber-300">{tl.title}</a>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>
                            {tl.task_status === "delivered" ? "Dostarczone" : tl.task_status === "shipped" ? "Wysłane" : tl.task_status === "handed_over" ? "Przekazane" : "W realizacji"}
                          </div>
                        </div>
                        {tl.tracking_no && <div className="text-xs" style={{ color: "var(--mut)" }}>Nr przesyłki: <b style={{ color: "var(--ink)" }}>{tl.tracking_no}</b></div>}
                      </div>

                      {tl.task_status === "shipped" && <div className="mt-3 rounded-lg p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                        <div className="text-xs" style={{ color: "var(--mut)" }}>Doręczenie sprawdzamy automatycznie po statusie kuriera. Jeśli paczka jest już u Ciebie, możesz potwierdzić ją ręcznie.</div>
                        <button disabled={confirming === tl.task_id} onClick={() => confirmItem(o.order_id, tl.task_id)} className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>✓ Potwierdzam odbiór tej przesyłki</button>
                      </div>}

                      <div className="mt-4 space-y-3">
                        {(tl.events ?? []).map((event, idx) => {
                          const meta = eventLabel[event.event_type] ?? { icon: "•", label: event.event_type };
                          const trackingNo = typeof event.details?.tracking_no === "string" ? event.details.tracking_no : null;
                          const source = event.event_type === "delivered" && typeof event.details?.source === "string" ? event.details.source : null;
                          return <div key={`${event.event_type}-${event.created_at}-${idx}`} className="flex gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{meta.icon}</div>
                            <div className="min-w-0 flex-1 border-b pb-3" style={{ borderColor: "var(--line)" }}>
                              <div className="text-sm font-medium">{meta.label}{source === "courier" ? " przez kuriera" : source === "buyer" ? " przez Ciebie" : ""}</div>
                              <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{new Date(event.created_at).toLocaleString("pl-PL")}{trackingNo ? ` · nr przesyłki ${trackingNo}` : ""}</div>
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>)}
                  </div>}
                </div>}
              </div>

              <div className="flex justify-between items-center pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="text-xs" style={{ color: "var(--green)" }}>Cashback +{Math.round(o.cashback).toLocaleString("pl-PL")} pkt</span>
                <span className="font-display text-xl font-semibold">{zl(o.total)}</span>
              </div>
            </div>;
          })}
        </div>
      </main>
    </div>
  );
}
