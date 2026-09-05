export type InvoiceSnapshot = {
  requested: boolean;
  company_name?: string | null;
  tax_id?: string | null;
  street?: string | null;
  city?: string | null;
  postal?: string | null;
  country?: string | null;
  snapshot_at?: string | null;
};

type Props = {
  invoice?: InvoiceSnapshot | null;
  compact?: boolean;
  showNoInvoice?: boolean;
};

export default function InvoiceSnapshotCard({ invoice, compact = false, showNoInvoice = false }: Props) {
  if (!invoice?.requested) {
    if (!showNoInvoice) return null;
    return <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--mut)" }}>🧾 Klient nie podał danych do faktury dla tego zamówienia.</div>;
  }

  return <div className={`rounded-2xl ${compact ? "p-3" : "p-4"}`} style={{ background: "rgba(232,137,26,.07)", border: "1px solid rgba(232,137,26,.24)" }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>🧾 Dane do faktury</div>
      {invoice.snapshot_at && <div className="text-[10px]" style={{ color: "var(--mut)" }}>Dane zamrożone {new Date(invoice.snapshot_at).toLocaleString("pl-PL")}</div>}
    </div>
    <div className="mt-2 text-sm font-semibold">{invoice.company_name || "—"}</div>
    <div className="mt-0.5 text-sm">NIP: <b>{invoice.tax_id || "—"}</b></div>
    <div className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>
      {invoice.street || "—"}<br />
      {[invoice.postal, invoice.city].filter(Boolean).join(" ") || "—"}{invoice.country ? ` · ${invoice.country}` : ""}
    </div>
    <div className="mt-2 text-[10px] leading-4" style={{ color: "var(--mut)" }}>To dane nabywcy zapisane przy zakupie. Sam dokument faktury nie został jeszcze wygenerowany przez Sunrise Market.</div>
  </div>;
}
