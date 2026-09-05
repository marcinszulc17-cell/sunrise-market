import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myOrders, openReturn, myReturns } from "../lib/api";
import InvoiceSnapshotCard, { type InvoiceSnapshot } from "../components/InvoiceSnapshotCard";
import SalesDocumentsPanel from "../components/SalesDocumentsPanel";
import { zl } from "../lib/money";
import ReviewInline, { type MyReview } from "../components/ReviewInline";

type Item = { offer_id: string; title: string; qty: number; price: number };
type PickupInfo = { seller: string; address: string | null; hours: string | null; note: string | null; ready: boolean; handed_over: boolean };
type Order = { pickup?: PickupInfo[] | null; order_id: string; status: string; total: number; cashback: number; created_at: string; shipping_method: string | null; tracking_no: string | null; invoice: InvoiceSnapshot; items: Item[] };
type TimelineEvent = { event_type: string; details: Record<string, unknown>; created_at: string };
type ItemTimeline = { task_id: string; offer_id: string; title: string; task_status: string; tracking_no: string | null; events: TimelineEvent[] };

const statusLabel: Record<string, string> = {
  created: "Utworzone", paid: "Opłacone", shipped: "Wysłane",
  delivered: "Dostarczone", completed: "Zakończone", cancelled: "Anulowane", disputed: "Spór w toku",
};
type Dispute = { id: string; order_id: string; reason: string; status: string; resolution: string | null; created_at: string; resolved_at: string | null; amount: number };
const disputeLabel: Record<string, string> = { open: "Spór w toku — wypłata dla sprzedawcy wstrzymana", refunded: "Spór zakończony — zwrot środków do Ciebie", released: "Spór zakończony — wypłata zwolniona sprzedawcy", rejected: "Spór odrzucony" };
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
  const [disputes, setDisputes] = useState<Record<string, Dispute>>({});
  const [disputeFormFor, setDisputeFormFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [myReviews, setMyReviews] = useState<Record<string, MyReview>>({});
  const [subs, setSubs] = useState<{ id: string; title: string; qty: number; status: string; price_gross: number; next_run: string | null; canceled_at: string | null }[]>([]);

  async function load() {
    setOrders((await myOrders()) as Order[]);
    try { const { data } = await supabase.schema("market").rpc("my_reviews"); setMyReviews(Object.fromEntries(((data ?? []) as MyReview[]).map((r) => [r.offer_id, r]))); } catch { /* brak opinii */ }
    try { const { data } = await supabase.schema("market").rpc("my_subscriptions"); setSubs((data ?? []) as typeof subs); } catch { /* brak subskrypcji */ }
    const r = (await myReturns()) as { order_id: string; status: string }[];
    setReturns(Object.fromEntries(r.map((x) => [x.order_id, x.status])));
    try {
      const { data } = await supabase.rpc("my_order_disputes");
      const map: Record<string, Dispute> = {};
      for (const d of ((data ?? []) as Dispute[])) { if (!map[d.order_id] || d.status === "open") map[d.order_id] = d; }
      setDisputes(map);
    } catch { /* brak sporów */ }
  }

  async function confirmOrder(orderId: string) {
    if (!window.confirm("Potwierdzasz odbiór całego zamówienia? Po potwierdzeniu wypłata trafi do sprzedawcy.")) return;
    setConfirming(orderId);
    const { data, error } = await supabase.rpc("buyer_confirm_delivery", { p_order: orderId });
    setConfirming(null);
    if (error || !data?.ok) { alert(error?.message ?? data?.message ?? "Nie udało się potwierdzić odbioru."); return; }
    await load();
  }

  async function submitDispute(orderId: string) {
    const reason = disputeReason.trim();
    if (reason.length < 10) { setDisputeError("Opisz problem w co najmniej 10 znakach."); return; }
    setDisputeBusy(true); setDisputeError(null);
    const { data, error } = await supabase.rpc("open_dispute", { p_order: orderId, p_reason: reason });
    setDisputeBusy(false);
    if (error || !data?.ok) { setDisputeError(error?.message ?? data?.message ?? "Nie udało się zgłosić problemu."); return; }
    setDisputeFormFor(null); setDisputeReason("");
    await load();
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
            <img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div className="flex-1" />
          <a href="/portfel" className="text-sm navlink">Portfel</a>
          <a href="/" className="text-sm navlink">← Sklep</a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-4">Moje zamówienia</h1>
        <div className="mb-6 rounded-2xl px-4 py-3 text-xs leading-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.25)", color: "var(--mut)" }}>
          <b style={{ color: "var(--ink)" }}>🛡 Ochrona Kupujących Sunrise</b> — sprzedawca otrzymuje pieniądze dopiero po Twoim potwierdzeniu odbioru (lub automatycznie po 14 dniach od wysyłki). <a href="/legal/ochrona-kupujacego.html" className="underline" style={{ color: "var(--gold)" }}>Zasady</a>
        </div>

        {subs.length > 0 && <section className="mb-8 rounded-2xl p-5" style={{ background: "rgba(56,224,240,.06)", border: "1px solid rgba(56,224,240,.2)" }}>
          <h2 className="font-semibold text-lg">🔁 Moje subskrypcje</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Opłacane z góry co miesiąc, odnawiane automatycznie kartą — bez przerw w usłudze.</p>
          <div className="mt-3 space-y-2">
            {subs.map((sub) => <div key={sub.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div><div className="font-medium">{sub.title}{sub.qty > 1 ? ` × ${sub.qty}` : ""}</div><div className="text-xs" style={{ color: "var(--mut)" }}>{sub.status === "active" ? `Aktywna · następne odnowienie ${sub.next_run ? new Date(sub.next_run).toLocaleDateString("pl-PL") : "—"}` : `Zakończona${sub.canceled_at ? ` ${new Date(sub.canceled_at).toLocaleDateString("pl-PL")}` : ""}`}</div></div>
              <div className="font-semibold">{zl(sub.price_gross)} <span className="text-xs font-normal" style={{ color: "var(--mut)" }}>/ mies.</span></div>
            </div>)}
          </div>
        </section>}

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
                  <div key={i} className="text-sm">
                    <div className="flex justify-between">
                      <a href={`/produkt/${it.offer_id}`} className="hover:text-amber-300">{it.title} × {it.qty}</a>
                      <span style={{ color: "var(--mut)" }}>{zl(it.price * it.qty)}</span>
                    </div>
                    {["paid", "shipped", "delivered", "completed"].includes(o.status) && <div className="mt-1"><ReviewInline offerId={it.offer_id} title={it.title} existing={myReviews[it.offer_id]} onSaved={(r) => setMyReviews((m) => ({ ...m, [it.offer_id]: r }))} /></div>}
                  </div>
                ))}
              </div>
              {(o.shipping_method || o.tracking_no) && (
                <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>
                  🚚 Dostawa: {o.shipping_method ?? "—"}{o.tracking_no && <> · nr przesyłki <b style={{ color: "var(--ink)" }}>{o.tracking_no}</b></>}
                </div>
              )}
              {Array.isArray(o.pickup) && o.pickup.length > 0 && o.pickup.map((p, i) => <div key={i} className="mb-3 rounded-xl p-3 text-sm" style={{ background: p.handed_over ? "rgba(122,184,154,.08)" : p.ready ? "rgba(122,184,154,.14)" : "rgba(232,200,150,.08)", border: `1px solid ${p.ready || p.handed_over ? "rgba(122,184,154,.4)" : "rgba(232,200,150,.3)"}` }}>
                <div className="font-semibold">{p.handed_over ? "✅ Odebrane w punkcie" : p.ready ? "🏪 Gotowe do odbioru!" : "🏪 Odbiór osobisty — sprzedawca przygotowuje zamówienie"}</div>
                <div className="mt-1" style={{ color: "var(--mut)" }}><b style={{ color: "var(--ink)" }}>{p.seller}</b>{p.address ? <> · {p.address}</> : null}{p.hours ? <><br />Godziny odbioru: {p.hours}</> : null}{p.note ? <><br />{p.note}</> : null}</div>
                {!p.handed_over && <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Przy odbiorze podaj numer zamówienia <b style={{ color: "var(--ink)" }}>#{o.order_id.slice(0, 8).toUpperCase()}</b>.{p.ready ? "" : " Dostaniesz powiadomienie, gdy będzie gotowe."}</div>}
              </div>)}
              {o.invoice?.requested && <div className="mb-3"><InvoiceSnapshotCard invoice={o.invoice} compact /></div>}
              <SalesDocumentsPanel orderId={o.order_id} mode="buyer" invoiceRequested={Boolean(o.invoice?.requested)} />

              {(() => {
                const d = disputes[o.order_id];
                const protectionActive = ["paid", "shipped", "delivered"].includes(o.status) && !d;
                return <div className="mt-3 rounded-xl p-3 text-xs leading-5" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
                  {o.status === "disputed" || d?.status === "open"
                    ? <div className="font-semibold" style={{ color: "#F25CB0" }}>⚠ {disputeLabel.open}</div>
                    : d
                      ? <div style={{ color: "var(--mut)" }}>{disputeLabel[d.status] ?? d.status}{d.resolution ? <> · {d.resolution}</> : null}</div>
                      : o.status === "completed"
                        ? <div style={{ color: "var(--mut)" }}>🛡 Ochrona Kupujących zakończona — wypłata przekazana sprzedawcy.</div>
                        : o.status === "delivered"
                          ? <div style={{ color: "var(--green)" }}>🛡 Ochrona Kupujących aktywna — masz 14 dni od doręczenia na zgłoszenie problemu.</div>
                          : ["paid", "shipped"].includes(o.status)
                            ? <div style={{ color: "var(--green)" }}>🛡 Ochrona Kupujących aktywna — środki są u Sunrise do potwierdzenia odbioru.</div>
                            : null}
                  {protectionActive && <div className="mt-2 flex flex-wrap gap-2">
                    {["paid", "shipped"].includes(o.status) && <button disabled={confirming === o.order_id} onClick={() => confirmOrder(o.order_id)} className="rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>✓ Potwierdź odbiór</button>}
                    <button onClick={() => { setDisputeFormFor(disputeFormFor === o.order_id ? null : o.order_id); setDisputeReason(""); setDisputeError(null); }} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zgłoś problem</button>
                  </div>}
                  {protectionActive && disputeFormFor === o.order_id && <div className="mt-3">
                    <textarea rows={3} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Opisz problem z zamówieniem (min. 10 znaków) — np. towar nie dotarł, jest uszkodzony lub niezgodny z opisem." className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                    {disputeError && <div className="mt-1 text-xs" style={{ color: "#ef4444" }}>{disputeError}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button disabled={disputeBusy || disputeReason.trim().length < 10} onClick={() => submitDispute(o.order_id)} className="rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{disputeBusy ? "Wysyłam…" : "Wyślij zgłoszenie"}</button>
                      <button onClick={() => setDisputeFormFor(null)} className="text-sm" style={{ color: "var(--mut)" }}>Anuluj</button>
                      <span className="text-xs" style={{ color: "var(--mut)" }}>Wypłata dla sprzedawcy zostanie wstrzymana do wyjaśnienia.</span>
                    </div>
                  </div>}
                </div>;
              })()}

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
