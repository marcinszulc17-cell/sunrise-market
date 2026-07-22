import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myOrders, confirmDelivery, openReturn, myReturns } from "../lib/api";

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
type Item = { offer_id: string; title: string; qty: number; price: number };
type Order = { order_id: string; status: string; total: number; cashback: number; created_at: string; shipping_method: string | null; tracking_no: string | null; items: Item[] };

const statusLabel: Record<string, string> = {
  created: "Utworzone", paid: "Opłacone", shipped: "Wysłane",
  delivered: "Dostarczone", completed: "Zakończone", cancelled: "Anulowane", disputed: "Spór",
};
const statusColor: Record<string, string> = {
  paid: "var(--green)", shipped: "#38E0F0", delivered: "#7AB89A", completed: "#7AB89A",
  cancelled: "#F25CB0", disputed: "#F25CB0",
};

export default function Zamowienia() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<Record<string, string>>({});

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
  async function onConfirm(id: string) { await confirmDelivery(id); await load(); }
  async function onReturn(id: string) {
    const reason = window.prompt("Powód zwrotu / reklamacji:");
    if (reason === null) return;
    try { await openReturn(id, reason); await load(); } catch (e) { alert((e as Error).message); }
  }
  const retLabel: Record<string, string> = { requested: "Zwrot: w trakcie", approved: "Zwrot: zaakceptowany", refunded: "Zwrot: zwrócono na portfel", rejected: "Zwrot: odrzucony" };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
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
          {orders.map((o) => (
            <div key={o.order_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
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
              {o.status === "shipped" && (
                <button onClick={() => onConfirm(o.order_id)} className="mb-3 mr-2 text-sm font-semibold px-4 py-2 rounded-xl text-black"
                        style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>Potwierdź odbiór</button>
              )}
              {returns[o.order_id]
                ? <div className="mb-3 text-sm" style={{ color: "var(--gold)" }}>{retLabel[returns[o.order_id]] ?? returns[o.order_id]}</div>
                : (["paid", "shipped", "delivered"].includes(o.status) &&
                    <button onClick={() => onReturn(o.order_id)} className="mb-3 text-sm px-4 py-2 rounded-xl"
                            style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zwróć / reklamuj</button>)}
              <div className="flex justify-between items-center pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="text-xs" style={{ color: "var(--green)" }}>Cashback +{Math.round(o.cashback).toLocaleString("pl-PL")} pkt</span>
                <span className="font-display text-xl font-semibold">{zl(o.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
