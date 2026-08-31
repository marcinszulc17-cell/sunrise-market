import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sellerOrders } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import InvoiceSnapshotCard, { type InvoiceSnapshot } from "../components/InvoiceSnapshotCard";

type SellerOrderItem = { title: string; qty: number; payout: number };
type SellerOrder = {
  order_id: string;
  status: string;
  created_at: string;
  shipping_method: string | null;
  tracking_no: string | null;
  my_total: number;
  invoice: InvoiceSnapshot;
  items: SellerOrderItem[];
};

const statusLabel: Record<string, string> = {
  paid: "Opłacone",
  shipped: "Wysłane",
  delivered: "Dostarczone",
  completed: "Zakończone",
};

export default function SellerOrders() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); setLoading(false); return; }
      setAuthed(true);
      try { setRows((await sellerOrders()) as SellerOrder[]); }
      catch (e) { setMsg((e as Error).message); }
      finally { setLoading(false); }
    });
  }, []);

  const invoiceCount = rows.filter((row) => row.invoice?.requested).length;

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Zamówienia i faktury</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Widzisz wyłącznie zamówienia zawierające Twoje pozycje. Dane faktury są historycznym snapshotem z chwili zakupu.</p>
        </div>
        <Link to="/sprzedawca/rozliczenia" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Rozliczenia →</Link>
      </div>

      {authed === false && <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zaloguj się, aby zobaczyć zamówienia.</div>}
      {msg && <div className="mb-5 rounded-2xl p-4 text-sm" style={{ background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.22)", color: "#fca5a5" }}>{msg}</div>}

      {authed && <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Zamówienia" value={String(rows.length)} />
        <Stat label="Z fakturą VAT" value={String(invoiceCount)} accent={invoiceCount > 0} />
        <Stat label="Twoje wpływy" value={zl(rows.reduce((sum, row) => sum + Number(row.my_total || 0), 0))} />
      </div>}

      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie zamówień…</p>}
      {!loading && authed && rows.length === 0 && <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Nie masz jeszcze opłaconych zamówień.</div>}

      <div className="space-y-4">
        {rows.map((order) => <article key={order.order_id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: order.invoice?.requested ? "1px solid rgba(200,150,90,.34)" : "1px solid var(--line)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs" style={{ color: "var(--mut)" }}>{new Date(order.created_at).toLocaleString("pl-PL")} · nr {order.order_id.slice(0, 8)}</div>
              <div className="mt-1 font-semibold">{statusLabel[order.status] || order.status}</div>
            </div>
            <div className="text-right"><div className="text-xs" style={{ color: "var(--mut)" }}>Twój wpływ</div><div className="font-display text-xl font-semibold">{zl(order.my_total)}</div></div>
          </div>

          <div className="mt-4 space-y-2">
            {order.items.map((item, index) => <div key={`${item.title}-${index}`} className="flex justify-between gap-4 text-sm"><span>{item.title} × {item.qty}</span><span style={{ color: "var(--mut)" }}>{zl(item.payout)}</span></div>)}
          </div>

          {(order.shipping_method || order.tracking_no) && <div className="mt-3 text-xs" style={{ color: "var(--mut)" }}>🚚 {order.shipping_method || "Dostawa"}{order.tracking_no ? ` · ${order.tracking_no}` : ""}</div>}

          <div className="mt-4">
            <InvoiceSnapshotCard invoice={order.invoice} showNoInvoice />
          </div>
        </article>)}
      </div>
    </div>
  </main>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-2xl p-4" style={{ background: accent ? "rgba(200,150,90,.08)" : "var(--glass)", border: accent ? "1px solid rgba(200,150,90,.28)" : "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-2xl font-semibold" style={{ color: accent ? "var(--gold)" : "var(--ink)" }}>{value}</div></div>;
}
