import type { InvoiceDetails } from "../lib/invoiceCheckout";

type Props = {
  value: InvoiceDetails;
  onChange: (next: InvoiceDetails) => void;
  compact?: boolean;
};

const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
const inputStyle = { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" } as const;

export default function InvoiceDetailsFields({ value, onChange, compact = false }: Props) {
  const set = (key: keyof InvoiceDetails, next: string | boolean) => onChange({ ...value, [key]: next });
  return <div className={compact ? "mt-4" : "mt-5"}>
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-3" style={{ background: "var(--glass)", border: value.requested ? "1px solid var(--gold)" : "1px solid var(--line)" }}>
      <input type="checkbox" checked={value.requested} onChange={(e) => set("requested", e.target.checked)} className="mt-1" />
      <div>
        <div className="font-semibold">Chcę fakturę VAT</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>Dane zostaną zapisane przy tym zamówieniu i nie zmienią się później, nawet jeśli zaktualizujesz profil.</div>
      </div>
    </label>

    {value.requested && <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input value={value.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Nazwa firmy" className={`${inputClass} sm:col-span-2`} style={inputStyle} autoComplete="organization" />
      <input value={value.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="NIP" inputMode="numeric" className={inputClass} style={inputStyle} />
      <select value={value.country} onChange={(e) => set("country", e.target.value)} className={inputClass} style={inputStyle}>
        <option value="PL">Polska</option>
      </select>
      <input value={value.street} onChange={(e) => set("street", e.target.value)} placeholder="Ulica i numer" className={`${inputClass} sm:col-span-2`} style={inputStyle} autoComplete="street-address" />
      <input value={value.postal} onChange={(e) => set("postal", e.target.value)} placeholder="Kod pocztowy 00-000" className={inputClass} style={inputStyle} autoComplete="postal-code" />
      <input value={value.city} onChange={(e) => set("city", e.target.value)} placeholder="Miasto" className={inputClass} style={inputStyle} autoComplete="address-level2" />
    </div>}
  </div>;
}
