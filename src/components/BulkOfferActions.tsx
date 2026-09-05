import { useState } from "react";
import { supabase } from "../lib/supabase";

// Akcje masowe na zaznaczonych ofertach (decyzja właściciela 2026-09-05):
// cena +/- x%, ustaw cenę, ustaw stan magazynowy, ukryj/pokaż, promocja -x% do daty, zakończ promocję.
// Logika i uprawnienia są w RPC market.bulk_update_my_offers (tylko własne oferty; operator — wszystkie).

export type BulkAction = "price_percent" | "price_set" | "stock_set" | "hide" | "show" | "promo_set" | "promo_clear";

const inputClass = "rounded-xl px-3 py-2 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

export async function runBulkAction(offerIds: string[], action: BulkAction, value?: number | null, until?: string | null) {
  const { data, error } = await supabase.schema("market").rpc("bulk_update_my_offers", {
    p_offer_ids: offerIds,
    p_action: action,
    p_value: value ?? null,
    p_until: until ? new Date(until).toISOString() : null,
  });
  if (error) throw error;
  const r = (data ?? {}) as { ok?: boolean; updated?: number; selected?: number; error?: string; message?: string };
  if (!r.ok) throw new Error(r.message || r.error || "Nie udało się wykonać akcji");
  return r;
}

export default function BulkOfferActions({ count, onRun, onClear }: { count: number; onRun: (action: BulkAction, value?: number | null, until?: string | null) => Promise<void>; onClear: () => void }) {
  const [action, setAction] = useState<BulkAction>("price_percent");
  const [value, setValue] = useState<string>("");
  const [until, setUntil] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const needsValue = action === "price_percent" || action === "price_set" || action === "stock_set" || action === "promo_set";
  const label = action === "price_percent" ? "Zmiana ceny w % (np. 10 lub -5)"
    : action === "price_set" ? "Nowa cena brutto (zł)"
    : action === "stock_set" ? "Stan magazynowy (szt.)"
    : action === "promo_set" ? "Rabat w % (1–89)" : "";

  const preview = (() => {
    const v = Number(value);
    if (!needsValue || !value || Number.isNaN(v)) return null;
    if (action === "price_percent") return v >= 0 ? `Ceny wzrosną o ${v}%` : `Ceny spadną o ${Math.abs(v)}%`;
    if (action === "price_set") return `Każda zaznaczona oferta dostanie cenę ${v.toLocaleString("pl-PL")} zł`;
    if (action === "stock_set") return `Stan każdej oferty: ${v} szt.`;
    if (action === "promo_set") return `Promocja -${v}% (cena przekreślona + nowa), do ${until ? new Date(until).toLocaleString("pl-PL") : "…"}`;
    return null;
  })();

  async function run() {
    setBusy(true);
    try {
      await onRun(action, needsValue ? Number(value) : null, action === "promo_set" ? until : null);
      setValue("");
    } finally { setBusy(false); }
  }

  const disabled = busy || count === 0 || (needsValue && (value === "" || Number.isNaN(Number(value)))) || (action === "promo_set" && !until);

  return (
    <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.28)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Zaznaczone: {count}</div>
        <label className="text-xs" style={{ color: "var(--mut)" }}>Akcja
          <select className={`${inputClass} mt-1 block`} style={inputStyle} value={action} onChange={(e) => setAction(e.target.value as BulkAction)}>
            <option value="price_percent">Zmień cenę o %</option>
            <option value="price_set">Ustaw cenę</option>
            <option value="stock_set">Ustaw stan magazynowy</option>
            <option value="promo_set">Promocja: rabat % do daty</option>
            <option value="promo_clear">Zakończ promocję</option>
            <option value="hide">Ukryj</option>
            <option value="show">Pokaż</option>
          </select>
        </label>
        {needsValue && <label className="text-xs" style={{ color: "var(--mut)" }}>{label}
          <input type="number" step="0.01" className={`${inputClass} mt-1 block w-44`} style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>}
        {action === "promo_set" && <label className="text-xs" style={{ color: "var(--mut)" }}>Koniec promocji
          <input type="datetime-local" className={`${inputClass} mt-1 block`} style={inputStyle} value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>}
        <button disabled={disabled} onClick={run} className="rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Wykonuję…" : "Zastosuj"}</button>
        <button onClick={onClear} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Odznacz</button>
      </div>
      {preview && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>{preview}. Zmiany dotyczą tylko zaznaczonych ofert (poza archiwum i zablokowanymi).</div>}
    </div>
  );
}
