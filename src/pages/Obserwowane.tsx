// Ulubione (dawniej „Obserwowane”; zakładka „Ulubione” w dolnym pasku i nagłówku). Układ wg wzoru właściciela 2026-09-05:
// lewy panel konta (profil, sekcje, szybkie akcje, aktywność) + siatka kart z ceną na pierwszym miejscu.
// Dane: RPC my_watchlist (zdjęcie, cena, spadek ceny od dodania, ocena); usuwanie toggle_watch; porównanie w localStorage
// sunrise_compare_ids (max 4). Sortowanie tylko po stronie klienta. Bez wymyślonych liczników (pokazujemy tylko to, co mamy).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { myWatchlist, toggleWatch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { Ico, GOLD_GRAD, CARD, HomeFooter, timeAgo } from "../components/home/HomeShared";
import { SiteHeader, Breadcrumbs, SideNav } from "../components/home/SiteChrome";

type Row = { offer_id: string; title: string; price_gross: number; image_url: string | null; category: string | null; seller: string | null; price_at_add: number | null; price_dropped: boolean; price_drop_amount: number; rating: number; reviews: number; created_at?: string | null; location?: string | null };
const COMPARE_KEY = "sunrise_compare_ids";
type Sort = "added" | "price_asc" | "price_desc" | "drop";

function readCompare(): string[] { try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]"); } catch { return []; } }

export const ACCOUNT_NAV = (fav: number) => [
  { to: "/konto", label: "Profil", icon: <Ico name="user" size={18} /> },
  { to: "/obserwowane", label: "Ulubione", icon: <Ico name="heart" size={18} />, badge: fav || undefined },
  { to: "/wiadomosci", label: "Wiadomości", icon: <Ico name="mail" size={18} /> },
  { to: "/zamowienia", label: "Moje zakupy", icon: <Ico name="bag" size={18} /> },
  { to: "/rezerwacje", label: "Moje rezerwacje", icon: <Ico name="calendar" size={18} /> },
  { to: "/portfel", label: "Portfel Sunrise Pay", icon: <Ico name="sun" size={18} /> },
];

export default function Obserwowane() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState<string[]>(readCompare()); const [msg, setMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("added");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setAuthed(false); setLoading(false); return; }
      setAuthed(true);
      const u = data.session.user; setUser({ name: String(u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Twoje konto"), email: u.email || "" });
      try { setRows((await myWatchlist()) as Row[]); } catch { setRows([]); } finally { setLoading(false); }
    });
  }, []);

  const sorted = useMemo(() => { const r = [...rows]; if (sort === "price_asc") r.sort((a, b) => a.price_gross - b.price_gross); if (sort === "price_desc") r.sort((a, b) => b.price_gross - a.price_gross); if (sort === "drop") r.sort((a, b) => Number(b.price_dropped) - Number(a.price_dropped) || b.price_drop_amount - a.price_drop_amount); return r; }, [rows, sort]);

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

  const btn = "flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:opacity-90";

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 xl:px-10">
      <Breadcrumbs items={[{ label: "Strona główna", to: "/" }, { label: "Moje konto", to: "/konto" }, { label: "Ulubione" }]} />

      <div className="mt-5 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Panel konta ─────────────────────────────────────── */}
        <aside className="hidden h-fit rounded-2xl p-4 lg:block" style={CARD}>
          {user ? <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: "rgba(245,166,35,.16)", border: "1px solid rgba(245,166,35,.35)", color: "var(--gold)" }}>{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0"><div className="truncate font-bold">{user.name}</div><div className="truncate text-xs" style={{ color: "var(--mut)" }}>{user.email}</div><Link to="/konto" className="mt-1 inline-block text-xs font-semibold" style={{ color: "var(--gold)" }}>Edytuj profil →</Link></div>
          </div> : <div className="border-b pb-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>Nie jesteś zalogowany.</div>}
          <div className="mt-4"><SideNav items={ACCOUNT_NAV(rows.length)} current="/obserwowane" /></div>
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <div className="mb-2 text-sm font-bold">Szybkie akcje</div>
            <div className="grid gap-2">
              <Link to="/sprzedawca/wystaw" className={btn} style={{ background: GOLD_GRAD, color: "#101012" }}><Ico name="plus" size={16} strokeWidth={2.4} />Dodaj ogłoszenie</Link>
              <Link to="/sklep" className={btn} style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--line)" }}><Ico name="search" size={16} />Przeglądaj ogłoszenia</Link>
            </div>
          </div>
          {authed && <div className="mt-5 border-t pt-4 text-sm" style={{ borderColor: "var(--line)" }}>
            <div className="mb-2 font-bold">Twoja aktywność</div>
            <div className="flex items-center justify-between py-1"><span className="flex items-center gap-2" style={{ color: "var(--mut)" }}><Ico name="heart" size={16} stroke="var(--gold)" />Ulubione</span><b>{rows.length}</b></div>
            <div className="flex items-center justify-between py-1"><span className="flex items-center gap-2" style={{ color: "var(--mut)" }}><Ico name="bag" size={16} stroke="var(--gold)" />W porównaniu</span><b>{compare.length}</b></div>
          </div>}
        </aside>

        {/* ── Lista ───────────────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-3xl font-bold">Ulubione</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{authed && !loading ? `${rows.length} ${rows.length === 1 ? "zapisane ogłoszenie" : rows.length >= 2 && rows.length <= 4 ? "zapisane ogłoszenia" : "zapisanych ogłoszeń"} · powiadomimy Cię, gdy cena spadnie` : "Oferty, które oznaczyłeś ♡. Powiadomimy Cię, gdy cena spadnie."}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {compare.length > 0 && <Link to="/porownaj" className={btn} style={{ background: GOLD_GRAD, color: "#101012" }}>Porównaj ({compare.length}) →</Link>}
              {rows.length > 1 && <label className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm" style={CARD}><span style={{ color: "var(--mut)" }}>Sortowanie:</span><select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent font-semibold outline-none" style={{ color: "var(--ink)" }}><option value="added">Ostatnio dodane</option><option value="drop">Spadek ceny</option><option value="price_asc">Cena rosnąco</option><option value="price_desc">Cena malejąco</option></select></label>}
            </div>
          </div>
          {msg && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(245,166,35,.1)", border: "1px solid rgba(245,166,35,.3)", color: "var(--gold)" }}>{msg}</div>}

          {authed === false ? <div className="mt-5 rounded-2xl p-6" style={CARD}><div className="font-semibold">Zaloguj się, aby zobaczyć ulubione</div><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Ulubione oferty zapisujemy na Twoim koncie, więc są dostępne na każdym urządzeniu.</p><a href={`/login?next=${encodeURIComponent("/obserwowane")}`} className={`${btn} mt-4 inline-flex`} style={{ background: GOLD_GRAD, color: "#101012" }}>Zaloguj się</a></div>
          : loading ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={CARD} />)}</div>
          : rows.length === 0 ? <div className="mt-5 rounded-2xl p-6" style={CARD}><div className="font-semibold">Nie masz jeszcze ulubionych ogłoszeń</div><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Na karcie oferty dotknij ♡ — pojawi się tutaj, a my damy znać, gdy cena spadnie.</p><Link to="/sklep" className="mt-4 inline-block text-sm font-semibold" style={{ color: "var(--gold)" }}>Przeglądaj oferty →</Link></div>
          : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{sorted.map((x) => <article key={x.offer_id} className="group relative flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={CARD}>
              <Link to={`/produkt/${x.offer_id}`} className="block aspect-[4/3] w-full overflow-hidden" style={{ background: "var(--header)" }} tabIndex={-1} aria-hidden="true">{x.image_url ? <img src={x.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" /> : <div className="grid h-full place-items-center text-3xl">🛍️</div>}</Link>
              <button type="button" onClick={() => remove(x.offer_id)} aria-label="Usuń z ulubionych" aria-pressed="true" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full backdrop-blur transition hover:scale-105" style={{ background: "var(--gold)", color: "#101012", boxShadow: "0 4px 14px rgba(232,137,26,.4)" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" /></svg></button>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex flex-wrap items-baseline gap-2"><span className="text-lg font-bold" style={{ color: "var(--gold)" }}>{zl(x.price_gross)}</span>{x.price_dropped && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(122,184,154,.14)", color: "var(--green)" }}>↓ taniej o {zl(x.price_drop_amount)}</span>}</div>
                <Link to={`/produkt/${x.offer_id}`} className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{x.title}</Link>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}>
                  {x.category && <span className="rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)", color: "var(--ink)" }}>{x.category}</span>}
                  <span className="truncate">{x.location ? `📍 ${x.location}` : x.seller}</span>{timeAgo(x.created_at) && <span className="ml-auto shrink-0">🕒 {timeAgo(x.created_at)}</span>}
                </div>
                <div className="mt-auto flex gap-2 pt-3 text-xs">
                  <button type="button" onClick={() => toggleCompare(x.offer_id)} className="h-9 flex-1 rounded-lg font-semibold" style={compare.includes(x.offer_id) ? { background: "rgba(122,184,154,.14)", color: "var(--green)", border: "1px solid rgba(122,184,154,.3)" } : { background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--gold)" }}>{compare.includes(x.offer_id) ? "✓ W porównaniu" : "+ Porównaj"}</button>
                  <button type="button" onClick={() => remove(x.offer_id)} className="h-9 rounded-lg px-3" style={{ border: "1px solid var(--line)", color: "var(--mut)" }}>Usuń</button>
                </div>
              </div>
            </article>)}</div>}

          {authed && rows.length > 0 && <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl p-5" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.14),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: "rgba(245,166,35,.16)", color: "var(--gold)" }}><Ico name="heart" size={22} /></div>
            <div className="min-w-0 flex-1"><div className="font-bold">Nie przegap świetnych okazji!</div><div className="text-sm" style={{ color: "var(--mut)" }}>Zapisuj ogłoszenia, które Cię interesują, i wracaj do nich w dowolnym momencie.</div></div>
            <Link to="/sklep" className={btn} style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Przeglądaj więcej ogłoszeń →</Link>
          </div>}
        </section>
      </div>
    </div>
    <HomeFooter />
  </main>;
}
