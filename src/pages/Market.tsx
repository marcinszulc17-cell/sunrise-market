import { useEffect, useState } from "react";
import { searchOffers } from "../lib/api";

type Offer = { offer_id: string; title: string; price_gross: number; category: string; seller: string; score: number };

export default function Market() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(query: string | null) {
    setLoading(true); setErr(null);
    try { setOffers(await searchOffers(query)); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(null); }, []);

  const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <header className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl grid place-items-center text-white"
             style={{ background: "linear-gradient(135deg,#F26B1D,#E0A21B)" }}>☀</div>
        <h1 className="text-2xl font-bold" style={{ color: "#171520" }}>Sunrise Market</h1>
        <div className="flex-1 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load(q)}
                 placeholder="Szukaj produktów…"
                 className="flex-1 border rounded-xl px-4 py-2 outline-none" />
          <button onClick={() => load(q)}
                  className="text-white font-semibold px-5 rounded-xl"
                  style={{ background: "#F26B1D" }}>Szukaj</button>
        </div>
      </header>

      {loading && <p className="text-zinc-500">Ładowanie ofert…</p>}
      {err && <p className="text-red-600">Błąd: {err}</p>}
      {!loading && !err && offers.length === 0 && <p className="text-zinc-500">Brak ofert.</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        {offers.map((o) => {
          const cb = Math.round(o.price_gross * 0.03);
          return (
            <div key={o.offer_id} className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="h-28 grid place-items-center text-5xl"
                   style={{ background: "linear-gradient(135deg,#FFF1E0,#FCE0BD)" }}>📦</div>
              <div className="p-3 flex flex-col gap-1">
                <div className="font-semibold text-sm leading-tight">{o.title}</div>
                <div className="text-xs text-zinc-500">{o.seller} · {o.category}</div>
                <div className="font-bold text-xl">{zl(o.price_gross)}</div>
                <div className="text-xs font-semibold" style={{ color: "#1A9E55" }}>
                  3% cashback = {zl(cb)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400 text-center mt-8">
        Front czyta oferty z bazy (RPC search_offers). Zdjęcia, koszyk, Suri, panele — Daniel rozbudowuje na tym scaffoldzie.
      </p>
    </div>
  );
}
