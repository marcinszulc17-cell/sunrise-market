// Wspólne elementy strony głównej desktop (Home.tsx) i mobile/app (Start.tsx): ikony, lista działów,
// karta polecanej oferty oraz hooki danych. Tylko istniejące RPC i trasy — bez nowej logiki biznesowej.
//  • useHomeFeed: „Dla Ciebie” (recommended_offers, tylko zalogowani) → home_promoted → search_offers_v2 (dla gościa).
//  • usePopularCategories: kategorie główne z aktywnymi ofertami (category_counts).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recommendedOffers, homePromoted, searchOffersWithAttributes, toggleWatch, watchedIds, categoryCounts } from "../../lib/api";
import { getMarketConfig, cashbackFor } from "../../lib/marketConfig";
import { supabase } from "../../lib/supabase";
import { zl } from "../../lib/money";

export const GOLD_GRAD = "linear-gradient(135deg,#E8891A,#F5A623)";
export const CARD = { background: "var(--glass)", border: "1px solid var(--line)" } as const;

export const ICONS = {
  bag: <path d="M6 8h12l1 12H5L6 8zm3 0V6a3 3 0 0 1 6 0v2" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h2" /></>,
  house: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  car: <><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5H3z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /><path d="M5 13h14" /></>,
  wrench: <path d="M14 4a4 4 0 0 0-3.6 5.7L4 16.1V20h3.9l6.4-6.4A4 4 0 0 0 20 10l-2.6 1.4L15.6 9 17 6.4 14 4z" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  heart: <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  cart: <><path d="M3 4h2l2.4 11h11.2L21 8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />,
} as const;
export type IconName = keyof typeof ICONS;

export function Ico({ name, size = 18, stroke = "currentColor", strokeWidth = 1.7 }: { name: IconName; size?: number; stroke?: string; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}
// Subtelny odcień ikony (wg wzoru): karta zostaje ciemna, kolor tylko w kafelku ikony.
export const TINTS = {
  amber: { c: "#F5A623", bg: "rgba(245,166,35,.16)", bd: "rgba(245,166,35,.35)" },
  violet: { c: "#B98CFF", bg: "rgba(185,140,255,.14)", bd: "rgba(185,140,255,.32)" },
  green: { c: "#5CD39A", bg: "rgba(92,211,154,.14)", bd: "rgba(92,211,154,.32)" },
  blue: { c: "#6FB1FF", bg: "rgba(111,177,255,.14)", bd: "rgba(111,177,255,.32)" },
  orange: { c: "#FF8A3D", bg: "rgba(255,138,61,.14)", bd: "rgba(255,138,61,.32)" },
} as const;
export type Tint = keyof typeof TINTS;
/** Tło kafla działu w odcieniu ikony (wg wzoru: każdy kafel lekko tonowany, nadal ciemny). */
export function tileStyle(tint: Tint): React.CSSProperties {
  const t = TINTS[tint];
  return { background: `linear-gradient(135deg, ${t.bg} 0%, rgba(24,24,27,.85) 70%)`, border: `1px solid ${t.bd}` };
}
export function IconTile({ name, size = 48, tint = "amber" }: { name: IconName; size?: number; tint?: Tint }) {
  const t = TINTS[tint];
  return <div className="grid shrink-0 place-items-center rounded-2xl" style={{ width: size, height: size, background: t.bg, border: `1px solid ${t.bd}` }}><Ico name={name} size={Math.round(size / 2)} stroke={t.c} /></div>;
}

// Działy strony głównej — istniejące trasy: /sklep (pełny katalog), /szukaj (parametry q/kat/tryb), portale.
export type Section = { to: string; icon: IconName; tint: Tint; title: string; short: string; desc: string; cta: string };
// Opisy = prawdziwe kategorie z bazy (market.categories), bez wymyślonych działów.
export const SECTIONS: Section[] = [
  { to: "/sklep", icon: "bag", tint: "amber", title: "Zakupy", short: "Produkty dla Ciebie", desc: "Elektronika, Moda, Dom, Dziecko, Sport i więcej", cta: "Przeglądaj produkty" },
  { to: "/szukaj?tryb=appointment", icon: "calendar", tint: "violet", title: "Rezerwacje", short: "Usługi i terminy", desc: "Noclegi, Wydarzenia, Usługi z terminarzem", cta: "Zarezerwuj termin" },
  { to: "/nieruchomosci", icon: "house", tint: "green", title: "Nieruchomości", short: "Domy i lokale", desc: "Mieszkania, Domy, Działki, Lokale użytkowe", cta: "Zobacz oferty" },
  { to: "/motoryzacja", icon: "car", tint: "blue", title: "Motoryzacja", short: "Pojazdy i części", desc: "Samochody, Motocykle, Części, Akcesoria", cta: "Znajdź pojazd" },
  { to: "/szukaj?kat=uslugi-i-reklama", icon: "wrench", tint: "orange", title: "Usługi", short: "Fachowcy i firmy", desc: "Remonty, Transport, Zdrowie, Edukacja i więcej", cta: "Znajdź wykonawcę" },
  { to: "/szukaj?kat=oze-i-energia", icon: "bolt", tint: "amber", title: "OZE i Energia", short: "PV, pompy ciepła", desc: "Fotowoltaika, Pompy ciepła, Magazyny energii", cta: "Sprawdź oferty" },
];

export type FeedOffer = { offer_id: string; title: string; price_gross: number; image_url: string | null; category: string | null; seller: string | null; rating?: number; reviews?: number; location?: string | null };

function normalize(r: any): FeedOffer {
  const loc = r.location ?? r.city ?? (r.attributes && typeof r.attributes === "object" ? (r.attributes as any).location : null);
  return { offer_id: r.offer_id, title: r.title, price_gross: Number(r.price_gross), image_url: r.image_url ?? null, category: r.category ?? null, seller: r.seller ?? null, rating: r.rating, reviews: r.reviews, location: typeof loc === "string" && loc.trim() ? loc.trim() : null };
}

/** Polecane oferty + obserwowane. `personalized` = lista pochodzi z recommended_offers (zalogowany). */
export function useHomeFeed(limit: number) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedOffer[] | null>(null);
  const [personalized, setPersonalized] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [authed, setAuthed] = useState(false);
  const [rate, setRate] = useState(0.03);

  useEffect(() => {
    let alive = true;
    getMarketConfig().then((c) => { if (alive) setRate(c.cashbackRate); }).catch(() => {});
    (async () => {
      const { data } = await supabase.auth.getSession();
      const isAuthed = !!data.session;
      if (isAuthed) { setAuthed(true); watchedIds().then((ids) => { if (alive) setWatched(new Set(ids)); }).catch(() => {}); }
      let out: FeedOffer[] = [];
      if (isAuthed) { try { out = ((await recommendedOffers(limit)) as any[]).filter((r) => r?.offer_id).map(normalize); } catch { /* brak */ } }
      const fromReco = out.length;
      const add = (list: any[]) => { for (const r of list) { if (r?.offer_id && !out.some((x) => x.offer_id === r.offer_id)) out.push(normalize(r)); if (out.length >= limit) break; } };
      if (out.length < limit) { try { add((await homePromoted()) as any[]); } catch { /* brak */ } }
      if (out.length < limit) { try { add((await searchOffersWithAttributes(null, null, { limit })) as any[]); } catch { /* brak */ } }
      if (alive) { setRows(out.slice(0, limit)); setPersonalized(fromReco > 0); }
    })();
    return () => { alive = false; };
  }, [limit]);

  async function heart(id: string) {
    if (!authed) { navigate(`/login?next=${encodeURIComponent("/")}`); return; }
    setWatched((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    try { await toggleWatch(id); } catch { /* stan odświeży się przy następnym wejściu */ }
  }
  return { rows, personalized, watched, heart, rate, authed };
}

export type Cat = { id: string; slug: string; name: string; count: number };
/** Kategorie główne z co najmniej jedną aktywną ofertą. */
export function usePopularCategories() {
  const [cats, setCats] = useState<Cat[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("categories").select("id,slug,name").is("parent_id", null).order("sort_order"),
      categoryCounts().catch(() => ({ byId: {} as Record<string, number>, total: 0 })),
    ]).then(([{ data }, { byId }]) => { if (alive) setCats(((data ?? []) as any[]).map((c) => ({ ...c, count: byId[c.id] ?? 0 })).filter((c) => c.count > 0)); });
    return () => { alive = false; };
  }, []);
  return cats;
}

/** Karta polecanej oferty: zdjęcie, cena, tytuł, lokalizacja/sprzedawca, kategoria, ♡. */
export function RecoCard({ o, fav, onFav, rate, compact = false, className = "", style }: { o: FeedOffer; fav: boolean; onFav: (id: string) => void; rate: number; compact?: boolean; className?: string; style?: React.CSSProperties }) {
  const href = `/produkt/${o.offer_id}`;
  return <article className={`group relative overflow-hidden rounded-2xl transition ${compact ? "" : "hover:-translate-y-0.5"} ${className}`} style={{ ...CARD, ...(compact ? {} : { boxShadow: "0 10px 30px rgba(0,0,0,.15)" }), ...style }}>
    <Link to={href} className={`block w-full overflow-hidden ${compact ? "aspect-square" : "aspect-[4/3]"}`} style={{ background: "var(--header)" }} tabIndex={-1} aria-hidden="true">{o.image_url ? <img src={o.image_url} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${compact ? "" : "transition duration-500 group-hover:scale-[1.04]"}`} /> : <div className="grid h-full place-items-center text-3xl">🛍️</div>}</Link>
    <button type="button" onClick={() => onFav(o.offer_id)} aria-pressed={fav} aria-label={fav ? "Usuń z ulubionych" : "Dodaj do ulubionych"} className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full backdrop-blur transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]" style={{ background: "rgba(10,18,36,.7)", border: "1px solid rgba(237,231,214,.15)", color: fav ? "#F25CB0" : "#EDE7D6" }}><svg width="20" height="20" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">{ICONS.heart}</svg></button>
    <div className={compact ? "p-3" : "p-4"}>
      <div className={`font-bold ${compact ? "text-base" : "text-lg"}`} style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div>
      <Link to={href} className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 focus-visible:underline">{o.title}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}>
        {o.category && <span className="truncate rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)", color: "var(--ink)" }}>{o.category}</span>}
        <span className="truncate">{o.location ? `📍 ${o.location}` : o.seller ?? ""}</span>
        {!compact && <span className="ml-auto shrink-0">+{cashbackFor(o.price_gross, rate).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} pkt</span>}
      </div>
    </div>
  </article>;
}

/** Zwięzła stopka (wg wzoru): logo, O nas, strony prawne, Pomoc, Kontakt. Bez social — brak profili. */
export function HomeFooter() {
  return <footer className="mt-12" style={{ borderTop: "1px solid var(--line)", background: "var(--header)" }}>
    <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-6 text-sm xl:px-10" style={{ color: "var(--mut)" }}>
      <a href="/" className="mr-2 flex items-center"><img src="/logo-sunrise-market-light.png" alt="Sunrise Market" className="brand-logo h-9 w-auto" /></a>
      <Link to="/o-nas" className="navlink">O nas</Link>
      <a href="/legal/regulamin.html" className="navlink">Regulamin</a>
      <a href="/legal/prywatnosc.html" className="navlink">Polityka prywatności</a>
      <a href="/legal/ochrona-kupujacego.html" className="navlink">Ochrona Kupujących</a>
      <a href="/legal/zwroty.html" className="navlink">Zwroty</a>
      <Link to="/pomoc" className="navlink">Pomoc</Link>
      <a href="/legal/kontakt.html" className="navlink">Kontakt</a>
      <span className="ml-auto text-xs">Bliżej ludzi. Bliżej możliwości. · © {new Date().getFullYear()} Sunrise Market</span>
    </div>
  </footer>;
}
