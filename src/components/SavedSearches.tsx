// Zapisane wyszukiwania z alertem (decyzja właściciela 2026-09-06): „🔔 Zapisz wyszukiwanie” na /szukaj → market.save_search;
// cron market-saved-search-tick co 30 min wysyła powiadomienie (in-app + push) o nowych ofertach; lista w Ulubionych.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export type SavedSearch = { id: string; name: string; query: string | null; category_slug: string | null; price_min: number | null; price_max: number | null; filters: Record<string, unknown>; new_count: number; created_at: string; last_checked_at: string };

export async function mySavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await supabase.rpc("my_saved_searches");
  if (error) throw error;
  return (data ?? []) as SavedSearch[];
}

/** Chipy aktywnych filtrów nad wynikami — każdy z ×, plus „wyczyść”. */
export function ActiveFilterChips({ items, onClearAll }: { items: { key: string; label: string; clear: () => void }[]; onClearAll: () => void }) {
  if (!items.length) return null;
  return <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Aktywne filtry">
    {items.map((it) => <button key={it.key} type="button" onClick={it.clear} className="flex h-9 items-center gap-1.5 rounded-full pl-3 pr-2 text-sm font-medium" style={{ background: "rgba(245,166,35,.14)", border: "1px solid var(--gold)", color: "var(--gold)" }} aria-label={`Usuń filtr ${it.label}`}>{it.label}<span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full text-xs" style={{ background: "rgba(245,166,35,.25)" }}>×</span></button>)}
    {items.length > 1 && <button type="button" onClick={onClearAll} className="text-xs underline" style={{ color: "var(--mut)" }}>wyczyść wszystkie</button>}
  </div>;
}

type BtnProps = { name: string; query: string; categorySlug: string; priceMin: number | null; priceMax: number | null; filters: Record<string, string | boolean> };

export default function SavedSearchButton({ name, query, categorySlug, priceMin, priceMax, filters }: BtnProps) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session)); }, []);
  useEffect(() => { setState("idle"); }, [query, categorySlug, priceMin, priceMax, JSON.stringify(filters)]);
  const meaningful = !!(query || categorySlug || Object.keys(filters).length);
  if (!meaningful) return null;

  async function save() {
    if (!authed) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    setState("busy"); setErr("");
    const { error } = await supabase.rpc("save_search", { p_name: name, p_query: query || null, p_category_slug: categorySlug || null, p_price_min: priceMin, p_price_max: priceMax, p_filters: filters });
    if (error) { setState("error"); setErr(error.message); return; }
    setState("saved");
  }
  return <div className="flex items-center gap-2">
    <button type="button" onClick={save} disabled={state === "busy" || state === "saved"} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" style={state === "saved" ? { background: "rgba(122,184,154,.15)", border: "1px solid rgba(122,184,154,.6)", color: "#7AB89A" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} title="Dostaniesz powiadomienie, gdy pojawi się nowe ogłoszenie pasujące do tych filtrów">
      {state === "saved" ? "✓ Zapisane — powiadomimy o nowych" : state === "busy" ? "Zapisuję…" : "🔔 Zapisz wyszukiwanie"}
    </button>
    {state === "saved" && <Link to="/obserwowane#zapisane" className="text-xs underline" style={{ color: "var(--mut)" }}>zobacz</Link>}
    {state === "error" && <span className="text-xs" style={{ color: "#f87171" }}>{err}</span>}
  </div>;
}

/** Lista w Ulubionych: nazwa, licznik nowych, „otwórz”, „usuń”. */
export function SavedSearchList() {
  const [rows, setRows] = useState<SavedSearch[] | null>(null);
  useEffect(() => { mySavedSearches().then(setRows, () => setRows([])); }, []);
  async function remove(id: string) {
    await supabase.rpc("delete_saved_search", { p_id: id });
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  }
  if (rows === null) return null;
  return <section id="zapisane" className="mt-8">
    <h2 className="text-lg font-bold">🔔 Zapisane wyszukiwania</h2>
    <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Sprawdzamy je co 30 minut i dajemy znać, gdy pojawi się nowe ogłoszenie.</p>
    {rows.length === 0 ? <div className="mt-3 rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Jeszcze nic nie zapisano. W <Link to="/szukaj" className="underline" style={{ color: "var(--gold)" }}>wyszukiwarce</Link> ustaw filtry i kliknij „Zapisz wyszukiwanie”.</div>
      : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{rows.map((s) => <li key={s.id} className="flex items-center gap-3 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <Link to={`/szukaj?zapisane=${s.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="truncate font-semibold">{s.name}</span>{s.new_count > 0 && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--gold)", color: "#101012" }}>+{s.new_count} nowe</span>}</div>
          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--mut)" }}>{[s.query && `„${s.query}”`, s.category_slug, s.price_min != null && `od ${s.price_min} zł`, s.price_max != null && `do ${s.price_max} zł`, ...Object.entries(s.filters || {}).map(([k, v]) => `${k}: ${String(v)}`)].filter(Boolean).join(" · ") || "wszystkie oferty"}</div>
        </Link>
        <button type="button" onClick={() => remove(s.id)} className="shrink-0 text-xs underline" style={{ color: "var(--mut)" }}>Usuń</button>
      </li>)}</ul>}
  </section>;
}
