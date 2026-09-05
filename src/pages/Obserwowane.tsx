// Obserwowane oferty (zakładka „Obserwuj” w dolnym pasku aplikacji). Wcześniej pasek prowadził do „Porównaj”,
// przez co obserwowane oferty „znikały”. Lista z RPC my_watchlist: zdjęcie, cena, spadek ceny od dodania,
// ocena; usuwanie (toggle_watch) i dodanie do porównania (localStorage sunrise_compare_ids, max 4).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { myWatchlist, toggleWatch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type Row = { offer_id: string; title: string; price_gross: number; image_url: string | null; category: string | null; seller: string | null; price_at_add: number | null; price_dropped: boolean; price_drop_amount: number; rating: number; reviews: number };
const COMPARE_KEY = "sunrise_compare_ids";

function readCompare(): string[] { try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]"); } catch { return []; } }

export default function Obserwowane() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState<string[]>(readCompare()); const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setAuthed(false); setLoading(false); return; }
      setAuthed(true);
      try { setRows((await myWatchlist()) as Row[]); } catch { setRows([]); } finally { setLoading(false); }
    });
  }, []);

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.offer_id !== id));
    try { await toggleWatch(id); } catch { /* lista odświeży się przy następnym wejściu */ }
  }
  function toggleCompare(id: string) {
    const cur = readCompare(); let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else { if (cur.length >= 4) { setMsg("Porównać można maksymalnie 4 oferty — usuń jedną z porównania."); return; } next = [...cur, id]; }
    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(next)); } catch { /* prywatny tryb */ }
    setCompare(next); setMsg(null);
  }

  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
        <a href="/" className="flex items-center gap-2"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-11 w-auto" /></a>
        <div className="flex-1" /><a href="/" className="navlink text-sm">← Sklep</a>
      </div>
    </header>
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Obserwowane</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Oferty, które oznaczyłeś ♡. Powiadomimy Cię, gdy cena spadnie.</p></div>
        {compare.length > 0 && <Link to="/porownaj" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#0E1729" }}>Porównaj ({compare.length}) →</Link>}
      </div>
      {msg && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(232,200,150,.1)", border: "1px solid rgba(232,200,150,.3)", color: "var(--gold)" }}>{msg}</div>}

      {authed === false ? <div className="mt-5 rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">Zaloguj się, aby zobaczyć obserwowane</div><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Obserwowane oferty zapisujemy na Twoim koncie, więc są dostępne na każdym urządzeniu.</p><a href={`/login?next=${encodeURIComponent("/obserwowane")}`} className="mt-4 inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#0E1729" }}>Zaloguj się</a></div>
      : loading ? <div className="mt-5 rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Wczytuję…</div>
      : rows.length === 0 ? <div className="mt-5 rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="font-semibold">Nie obserwujesz jeszcze żadnej oferty</div><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Na karcie oferty dotknij ♡ — pojawi się tutaj, a my damy znać, gdy cena spadnie.</p><Link to="/szukaj" className="mt-4 inline-block text-sm font-semibold" style={{ color: "var(--gold)" }}>Przeglądaj oferty →</Link></div>
      : <div className="mt-5 grid gap-3 sm:grid-cols-2">{rows.map((x) => <article key={x.offer_id} className="flex gap-3 rounded-2xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <Link to={`/produkt/${x.offer_id}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--header)" }}>{x.image_url ? <img src={x.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-2xl">🛍️</div>}</Link>
          <div className="min-w-0 flex-1">
            <Link to={`/produkt/${x.offer_id}`} className="line-clamp-2 text-sm font-semibold leading-5">{x.title}</Link>
            <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{[x.category, x.seller].filter(Boolean).join(" · ")}{x.reviews > 0 ? ` · ${Number(x.rating).toFixed(1)} ★ (${x.reviews})` : ""}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2"><span className="font-semibold" style={{ color: "var(--gold)" }}>{zl(x.price_gross)}</span>{x.price_dropped && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(122,184,154,.14)", color: "var(--green)" }}>↓ taniej o {zl(x.price_drop_amount)}</span>}</div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button type="button" onClick={() => toggleCompare(x.offer_id)} className="font-semibold" style={{ color: compare.includes(x.offer_id) ? "var(--green)" : "var(--gold)" }}>{compare.includes(x.offer_id) ? "✓ W porównaniu" : "+ Porównaj"}</button>
              <button type="button" onClick={() => remove(x.offer_id)} style={{ color: "var(--mut)" }}>Przestań obserwować</button>
            </div>
          </div>
        </article>)}</div>}
    </div>
  </main>;
}
