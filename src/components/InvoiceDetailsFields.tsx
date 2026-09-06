import { useEffect, useRef, useState } from "react";
import type { InvoiceDetails } from "../lib/invoiceCheckout";
import { lookupNip } from "../lib/nip";

type Props = {
  value: InvoiceDetails;
  onChange: (next: InvoiceDetails) => void;
  compact?: boolean;
};

const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
const inputStyle = { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" } as const;

/** Dane do faktury. Firma: po wpisaniu 10 cyfr NIP dane (nazwa, adres) podkładają się same z Białej Listy MF
 *  (decyzja właściciela 2026-09-06); wszystko można poprawić ręcznie. */
export default function InvoiceDetailsFields({ value, onChange, compact = false }: Props) {
  const set = (key: keyof InvoiceDetails, next: string | boolean) => onChange({ ...value, [key]: next });
  const [lookup, setLookup] = useState<{ state: "idle" | "busy" | "ok" | "err"; text?: string }>({ state: "idle" });
  const lastNip = useRef("");
  const latest = useRef(value); latest.current = value;

  useEffect(() => {
    const clean = value.tax_id.replace(/\D/g, "");
    if (!value.requested || value.country !== "PL" || clean.length !== 10 || clean === lastNip.current) return;
    lastNip.current = clean;
    let alive = true;
    setLookup({ state: "busy" });
    lookupNip(clean).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLookup({ state: "err", text: r.error }); return; }
      onChange({ ...latest.current, company_name: r.name || latest.current.company_name, street: r.street || latest.current.street, postal: r.postal || latest.current.postal, city: r.city || latest.current.city });
      setLookup({ state: "ok", text: `Dane z rejestru VAT (Biała Lista MF)${r.status_vat ? ` · ${r.status_vat === "Czynny" ? "czynny podatnik VAT" : r.status_vat}` : ""}` });
    }).catch(() => { if (alive) setLookup({ state: "err", text: "Nie udało się pobrać danych — wpisz je ręcznie" }); });
    return () => { alive = false; };
  }, [value.tax_id, value.requested, value.country]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={compact ? "mt-4" : "mt-5"}>
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-3" style={{ background: "var(--glass)", border: value.requested ? "1px solid var(--gold)" : "1px solid var(--line)" }}>
      <input type="checkbox" checked={value.requested} onChange={(e) => set("requested", e.target.checked)} className="mt-1" />
      <div>
        <div className="font-semibold">Chcę fakturę VAT na firmę</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>Wpisz NIP — nazwę i adres firmy podłożymy z rejestru VAT. Dane zostaną zapisane przy tym zamówieniu i nie zmienią się później.</div>
      </div>
    </label>

    {value.requested && <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input value={value.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="NIP (10 cyfr)" inputMode="numeric" autoFocus={!value.tax_id} className={inputClass} style={{ ...inputStyle, borderColor: lookup.state === "ok" ? "rgba(122,184,154,.7)" : lookup.state === "err" ? "rgba(232,137,26,.7)" : undefined }} aria-describedby="nip-status" />
      <select value={value.country} onChange={(e) => set("country", e.target.value)} className={inputClass} style={inputStyle}>
        <option value="PL">Polska</option>
      </select>
      <div id="nip-status" className="text-xs sm:col-span-2" style={{ color: lookup.state === "err" ? "var(--gold)" : "var(--mut)", minHeight: 16 }} aria-live="polite">
        {lookup.state === "busy" ? "Pobieram dane firmy z rejestru VAT…" : lookup.text || ""}
      </div>
      <input value={value.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Nazwa firmy" className={`${inputClass} sm:col-span-2`} style={inputStyle} autoComplete="organization" />
      <input value={value.street} onChange={(e) => set("street", e.target.value)} placeholder="Ulica i numer" className={`${inputClass} sm:col-span-2`} style={inputStyle} autoComplete="street-address" />
      <input value={value.postal} onChange={(e) => set("postal", e.target.value)} placeholder="Kod pocztowy 00-000" className={inputClass} style={inputStyle} autoComplete="postal-code" />
      <input value={value.city} onChange={(e) => set("city", e.target.value)} placeholder="Miasto" className={inputClass} style={inputStyle} autoComplete="address-level2" />
    </div>}
  </div>;
}
