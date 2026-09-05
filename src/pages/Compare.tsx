import { useEffect, useState } from "react";
import { SiteHeader } from "../components/home/SiteChrome";
import { getOffer } from "../lib/api";
import { zl } from "../lib/money";

const KEY = "sunrise_compare_ids";

export default function Compare() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem(KEY) || "[]").slice(0, 4); } catch { ids = []; }
    Promise.all(ids.map(id => getOffer(id).catch(() => null))).then(rows => setItems(rows.filter(Boolean))).finally(() => setLoading(false));
  }, []);

  function remove(id: string) {
    const next = items.filter(x => x.offer_id !== id);
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next.map(x => x.offer_id)));
  }

  const keys = Array.from(new Set(items.flatMap(x => Object.keys(x.attributes || {})))).filter(k => !["vin","registration_number","kw_number","offer_type","cashback_only","purchase_mode"].includes(k)).slice(0, 20);

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader compact />
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Porównaj oferty</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Możesz porównać maksymalnie 4 oferty obok siebie.</p>
      {loading && <p className="mt-8">Ładowanie…</p>}
      {!loading && items.length === 0 && <div className="mt-8 rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Nie masz jeszcze ofert do porównania. Wejdź w ofertę i kliknij „Porównaj”.</div>}
      {items.length > 0 && <div className="mt-6 overflow-x-auto"><table className="min-w-[800px] w-full border-collapse text-sm"><thead><tr><th className="p-3 text-left">Parametr</th>{items.map(o => <th key={o.offer_id} className="p-3 text-left align-top"><div className="w-48"><a href={`/produkt/${o.offer_id}`} className="font-semibold">{o.title}</a><div className="mt-2 text-xl font-bold">{zl(o.price_gross)}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{o.seller}</div><button onClick={() => remove(o.offer_id)} className="mt-2 text-xs underline">Usuń</button></div></th>)}</tr></thead><tbody>
        <tr style={{ borderTop: "1px solid var(--line)" }}><td className="p-3 font-semibold">Kategoria</td>{items.map(o => <td key={o.offer_id} className="p-3">{o.category}</td>)}</tr>
        <tr style={{ borderTop: "1px solid var(--line)" }}><td className="p-3 font-semibold">Cena</td>{items.map(o => <td key={o.offer_id} className="p-3 font-semibold">{zl(o.price_gross)}</td>)}</tr>
        {keys.map(k => <tr key={k} style={{ borderTop: "1px solid var(--line)" }}><td className="p-3 font-semibold capitalize">{k.split("_").join(" ")}</td>{items.map(o => <td key={o.offer_id} className="p-3">{formatValue((o.attributes || {})[k])}</td>)}</tr>)}
      </tbody></table></div>}
    </main>
  </div>;
}

function formatValue(v: any) {
  if (v === true) return "Tak";
  if (v === false || v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return Object.entries(v).map(([k,val]) => `${k}: ${String(val)}`).join(" · ");
  return String(v);
}
