// Wyszukiwarka z podpowiedziami na żywo (decyzja właściciela 2026-09-06 — „jak Allegro”): po 2 znakach RPC search_suggest
// → oferty z miniaturą, kategorie, miasta; bez frazy — ostatnie wyszukiwania (localStorage sm:recent). Strzałki/Enter/Esc.
// Używana w nagłówku (duży ekran), na ekranie startowym i nad wynikami /szukaj — jedno zachowanie wszędzie.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { offerDetailHref } from "../lib/bookingLink";
import { Ico, GOLD_GRAD } from "./home/HomeShared";

type Suggest = {
  offers: { id: string; title: string; price_gross: number; image_url: string | null; purchase_mode: string; category: string }[];
  categories: { name: string; slug: string }[];
  cities: { name: string; slug: string }[];
};
type Item = { kind: "recent" | "offer" | "category" | "city" | "query"; label: string; href?: string; sub?: string; img?: string | null; q?: string };
const RECENT_KEY = "sm:recent";
const EMPTY: Suggest = { offers: [], categories: [], cities: [] };

export function readRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
export function pushRecent(q: string) {
  const t = q.trim(); if (!t) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6))); } catch { /* prywatny tryb */ }
}

const cache = new Map<string, Suggest>();
async function fetchSuggest(q: string): Promise<Suggest> {
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const { data } = await supabase.rpc("search_suggest", { p_q: q, p_limit: 5 });
  const s = (data as Suggest) || EMPTY;
  cache.set(key, s);
  return s;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q: string) => void;           // Enter / przycisk — pełne wyszukiwanie
  placeholder?: string;
  className?: string;                      // klasa kontenera formularza
  style?: React.CSSProperties;
  inputClassName?: string;
  button?: "icon" | "text" | "none";
  autoFocus?: boolean;
  extra?: React.ReactNode;                 // np. wybór regionu w nagłówku
};

export default function SearchBox({ value, onChange, onSubmit, placeholder = "Szukaj produktów, usług, ogłoszeń…", className = "", style, inputClassName = "", button = "icon", autoFocus, extra }: Props) {
  const [open, setOpen] = useState(false);
  const [sug, setSug] = useState<Suggest>(EMPTY);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const wrap = useRef<HTMLFormElement>(null);
  const seq = useRef(0);
  const listId = useMemo(() => `sm-sug-${Math.random().toString(36).slice(2, 7)}`, []);

  useEffect(() => { setRecent(readRecent()); }, [open]);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setSug(EMPTY); return; }
    const my = ++seq.current;
    const t = setTimeout(() => { fetchSuggest(q).then((s) => { if (my === seq.current) setSug(s); }); }, 140);
    return () => clearTimeout(t);
  }, [value]);
  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("touchstart", onDoc, { passive: true });
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
  }, []);

  const items: Item[] = useMemo(() => {
    const q = value.trim();
    if (q.length < 2) return recent.map((r) => ({ kind: "recent", label: r, q: r }));
    const out: Item[] = [{ kind: "query", label: `Szukaj „${q}”`, q }];
    for (const c of sug.categories) out.push({ kind: "category", label: c.name, sub: "kategoria", href: `/szukaj?kat=${encodeURIComponent(c.slug)}` });
    for (const o of sug.offers) out.push({ kind: "offer", label: o.title, sub: `${zl(o.price_gross)}${o.purchase_mode === "daily" ? " / dobę" : ""} · ${o.category}`, img: o.image_url, href: offerDetailHref(o.id, o.purchase_mode !== "purchase") });
    for (const c of sug.cities) out.push({ kind: "city", label: `Sunrise Market w ${c.name}`, sub: "miasto", href: `/miasto/${c.slug}` });
    return out;
  }, [value, sug, recent]);

  function go(it: Item) {
    setOpen(false);
    if (it.href) { if (it.kind !== "offer") pushRecent(value.trim() || it.label); window.location.assign(it.href); return; }
    const q = it.q ?? it.label; onChange(q); pushRecent(q); onSubmit(q);
  }
  function submit(e: FormEvent) { e.preventDefault(); if (active >= 0 && items[active]) { go(items[active]); return; } setOpen(false); pushRecent(value); onSubmit(value.trim()); }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  }
  function clearRecent() { try { localStorage.removeItem(RECENT_KEY); } catch { /* ignoruj */ } setRecent([]); }

  const show = open && items.length > 0;
  return <form ref={wrap} onSubmit={submit} role="search" className={`relative ${className}`} style={style}>
    <span className="pl-4" style={{ color: "var(--mut)" }}><Ico name="search" size={20} /></span>
    <input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
      placeholder={placeholder} aria-label="Szukaj" autoFocus={autoFocus} enterKeyHint="search" autoComplete="off" role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
      className={`min-w-0 flex-1 bg-transparent px-3 py-3 text-base outline-none sm:text-sm ${inputClassName}`} style={{ color: "var(--ink)" }} />
    {value && <button type="button" onClick={() => { onChange(""); setSug(EMPTY); }} aria-label="Wyczyść" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg" style={{ color: "var(--mut)" }}>×</button>}
    {extra}
    {button === "icon" && <button type="submit" className="mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: GOLD_GRAD, color: "#101012" }} aria-label="Szukaj"><Ico name="search" size={20} strokeWidth={2.2} /></button>}
    {button === "text" && <button type="submit" className="h-11 shrink-0 rounded-r-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Szukaj</button>}

    {show && <div id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl shadow-2xl" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
      {value.trim().length < 2 && <div className="flex items-center justify-between px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mut)" }}><span>Ostatnie</span><button type="button" onClick={clearRecent} className="normal-case tracking-normal underline">wyczyść</button></div>}
      <ul className="max-h-[60vh] overflow-y-auto py-1.5">
        {items.map((it, i) => <li key={`${it.kind}-${it.label}-${i}`} role="option" aria-selected={active === i}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)} onMouseEnter={() => setActive(i)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left" style={{ background: active === i ? "rgba(245,166,35,.12)" : "transparent" }}>
            {it.kind === "offer" ? <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: "var(--glass)" }}>{it.img ? <img src={it.img} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Ico name="search" size={16} />}</span>
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm" style={{ background: "var(--glass)", color: "var(--mut)" }}>{it.kind === "recent" ? "🕒" : it.kind === "category" ? "▦" : it.kind === "city" ? "📍" : <Ico name="search" size={16} />}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.label}</span>{it.sub && <span className="block truncate text-xs" style={{ color: "var(--mut)" }}>{it.sub}</span>}</span>
            {it.kind === "offer" && <span className="shrink-0 text-xs" style={{ color: "var(--gold)" }}>→</span>}
          </button>
        </li>)}
      </ul>
    </div>}
  </form>;
}
