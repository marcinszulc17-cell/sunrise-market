import { useEffect, useState, type MouseEvent } from "react";
import { zl, pkt } from "../lib/money";
import { searchOffers, homePromoted, activeHomeBanners, activeBanners, categoryCounts, recommendedOffers, toggleWatch, watchedIds, myWatchlist } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useCart, addToCart } from "../lib/cart";
import SuriChat from "../components/SuriChat";
import NotificationsBell from "../components/NotificationsBell";
import ThemeToggle from "../components/ThemeToggle";
import FamilyClubBanner from "../components/FamilyClubBanner";
import { useSeo } from "../lib/seo";

const FREE_SHIP = 149;   // musi być spójne z Koszyk.tsx

type Offer = { offer_id: string; title: string; price_gross: number; category: string; seller: string; score: number; rating: number; reviews: number; image_url: string | null };
type Dept = { id?: string; slug: string; name: string };

function Stars({ rating, reviews }: { rating: number; reviews: number }) {
  if (!reviews) return <span className="text-xs" style={{ color: "var(--mut)" }}>Nowość</span>;
  const full = Math.round(rating);
  return (
    <span className="text-xs" style={{ color: "var(--gold)" }}>
      {"★".repeat(full)}<span style={{ color: "var(--soft,#5E5E75)" }}>{"★".repeat(5 - full)}</span>
      <span className="ml-1" style={{ color: "var(--mut)" }}>{rating.toFixed(1)} ({reviews})</span>
    </span>
  );
}


// wizual karty wg kategorii / nazwy produktu (emoji + gradient poświaty)
function catVisual(cat: string, title = ""): { emoji: string; from: string; to: string } {
  const t = (cat + " " + title).toLowerCase();
  const O = "#C8965A", G = "#E8C896", GR = "#7AB89A", CY = "#38E0F0", VI = "#8FB0EE", PU = "#3A6FD9", PK = "#F25CB0";
  if (t.includes("panel") || t.includes("fotowolt")) return { emoji: "🔆", from: O, to: G };
  if (t.includes("magazyn") || t.includes("bateri") || t.includes("inwerter")) return { emoji: "🔋", from: GR, to: CY };
  if (t.includes("pompa") || t.includes("ogrzew") || t.includes("kolektor")) return { emoji: "♨️", from: O, to: PK };
  if (t.includes("oze") || t.includes("energi")) return { emoji: "⚡", from: G, to: O };
  if (t.includes("smartfon") || t.includes("telefon")) return { emoji: "📱", from: CY, to: VI };
  if (t.includes("słuchaw") || t.includes("audio")) return { emoji: "🎧", from: VI, to: PU };
  if (t.includes("laptop") || t.includes("komputer")) return { emoji: "💻", from: CY, to: PU };
  if (t.includes("kamera") || t.includes("foto")) return { emoji: "📷", from: VI, to: CY };
  if (t.includes("elektronik")) return { emoji: "🔌", from: CY, to: VI };
  if (t.includes("agd") || t.includes("ekspres") || t.includes("odkurz") || t.includes("pral")) return { emoji: "🧺", from: CY, to: GR };
  if (t.includes("moda") || t.includes("kurtk") || t.includes("sneaker") || t.includes("but")) return { emoji: "👟", from: PK, to: VI };
  if (t.includes("dziecko") || t.includes("fotelik")) return { emoji: "🍼", from: PK, to: G };
  if (t.includes("motoryz") || t.includes("samochod")) return { emoji: "🚗", from: O, to: PK };
  if (t.includes("sport") || t.includes("rower") || t.includes("namiot")) return { emoji: "🚴", from: GR, to: CY };
  if (t.includes("zdrowie") || t.includes("uroda") || t.includes("wellness") || t.includes("szczotecz")) return { emoji: "💆", from: PK, to: O };
  if (t.includes("zwierz") || t.includes("karma")) return { emoji: "🐾", from: G, to: GR };
  if (t.includes("supermarket") || t.includes("kawa") || t.includes("kaw ")) return { emoji: "🛒", from: O, to: G };
  if (t.includes("dom") || t.includes("ogr")) return { emoji: "🏡", from: VI, to: PU };
  if (t.includes("kultura") || t.includes("rozryw")) return { emoji: "🎬", from: VI, to: PK };
  if (t.includes("bilet") || t.includes("wydarz")) return { emoji: "🎟️", from: O, to: VI };
  if (t.includes("sztuk") || t.includes("kolekcj")) return { emoji: "🎨", from: PK, to: CY };
  if (t.includes("przemys") || t.includes("firma")) return { emoji: "🏭", from: CY, to: VI };
  if (t.includes("usług") || t.includes("reklam")) return { emoji: "🛠️", from: G, to: O };
  return { emoji: "🌅", from: O, to: "#A97B42" };
}

// emoji dla chipa działu
function deptEmoji(name: string) { return catVisual(name).emoji; }

function CardSkeleton() {
  return (
    <article className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="h-36" style={{ background: "rgba(255,255,255,.04)" }} />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-3 w-2/3 rounded" style={{ background: "rgba(255,255,255,.06)" }} />
        <div className="h-4 w-full rounded" style={{ background: "rgba(255,255,255,.06)" }} />
        <div className="h-6 w-1/2 rounded mt-2" style={{ background: "rgba(255,255,255,.06)" }} />
        <div className="h-9 w-full rounded-xl mt-2" style={{ background: "rgba(255,255,255,.05)" }} />
      </div>
    </article>
  );
}

function OfferCard({ o, fav, onToggleFav, badge }: { o: Offer; fav: boolean; onToggleFav: (id: string) => void; badge?: string }) {
  const v = catVisual(o.category, o.title);
  const cashback = Math.round(o.price_gross * 0.03 * 100) / 100;
  const freeShip = o.price_gross >= FREE_SHIP;
  const [added, setAdded] = useState(false);

  // Dodanie do koszyka bez opuszczania katalogu — wcześniej każda karta wypychała
  // użytkownika na stronę produktu, nawet gdy już wiedział, czego chce.
  function add(e: MouseEvent) {
    e.preventDefault();
    addToCart({ offer_id: o.offer_id, title: o.title, price: o.price_gross });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="card-glow rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <a href={`/produkt/${o.offer_id}`} className="relative h-36 grid place-items-center text-5xl overflow-hidden"
         style={{ background: `radial-gradient(120px 80px at 50% 30%, ${v.from}33, transparent 70%), linear-gradient(135deg, ${v.from}22, ${v.to}22)` }}>
        {o.image_url
          ? <img src={o.image_url} alt={o.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          : <span aria-hidden="true">{v.emoji}</span>}
        {badge && <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{badge}</span>}
        <button onClick={(e) => { e.preventDefault(); onToggleFav(o.offer_id); }}
                aria-label={fav ? "Usuń z listy życzeń" : "Dodaj do listy życzeń"}
                className="absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center text-sm"
                style={{ background: "rgba(10,18,36,.5)", border: "1px solid var(--line)", color: fav ? "#F25CB0" : "#fff" }}>
          {fav ? "♥" : "♡"}
        </button>
      </a>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-xs" style={{ color: "var(--mut)" }}>{o.seller} · {o.category}</div>
        <Stars rating={o.rating} reviews={o.reviews} />
        <a href={`/produkt/${o.offer_id}`} className="font-semibold leading-snug flex-1 hover:text-amber-300">{o.title}</a>

        <div className="font-display text-2xl font-semibold">{zl(o.price_gross)}</div>

        {/* Sygnały zaufania — to, po czym klient decyduje, zanim kliknie */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full" title="1 pkt = 1 zł do wykorzystania w Sunrise Pay"
                style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>
            Cashback +{pkt(cashback)} pkt
          </span>
          {freeShip && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>
              Darmowa dostawa
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <button onClick={add}
                  className="flex-1 text-center text-sm font-semibold py-2 rounded-xl text-black transition-transform active:scale-95"
                  style={{ background: added ? "linear-gradient(135deg,#7AB89A,#1DB47A)" : "linear-gradient(135deg,#C8965A,#E8C896)" }}>
            {added ? "Dodano do koszyka" : "Do koszyka"}
          </button>
          <a href={`/produkt/${o.offer_id}`}
             className="px-3 grid place-items-center text-sm rounded-xl"
             style={{ border: "1px solid var(--line)", color: "var(--mut)" }}>
            Szczegóły
          </a>
        </div>
      </div>
    </article>
  );
}

export default function Market() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [q, setQ] = useState("");
  const [activeDept, setActiveDept] = useState<Dept | null>(null);
  const [activeSub, setActiveSub] = useState<Dept | null>(null);
  const [activeSub2, setActiveSub2] = useState<string | null>(null); // slug pod-podkategorii
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [depts, setDepts] = useState<Dept[]>([]);
  const [subs, setSubs] = useState<Dept[]>([]);
  const [subs2, setSubs2] = useState<Dept[]>([]);
  const cart = useCart();
  const cartN = cart.reduce((n, x) => n + x.qty, 0);
  const [promoted, setPromoted] = useState<Offer[]>([]);
  type Banner = { headline: string; link_url: string; image_url: string | null; seller: string };
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bi, setBi] = useState(0); // aktywny baner (rotacja)
  const [tiles, setTiles] = useState<Banner[]>([]);   // kafle kategorii OZE (640x360)
  const [strips, setStrips] = useState<Banner[]>([]); // paski promo (1300x220)
  const [authed, setAuthed] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [recs, setRecs] = useState<Offer[]>([]);
  const [sort, setSort] = useState("trafnosc");
  const [pMin, setPMin] = useState("");
  const [pMax, setPMax] = useState("");
  const [curSlug, setCurSlug] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);          // ile ofert pobrać (paginacja „pokaż więcej”)
  const [more, setMore] = useState(false);         // czy trwa doładowywanie
  const [wishMode, setWishMode] = useState(false);
  const [wish, setWish] = useState<(Offer & { price_dropped?: boolean })[]>([]);
  useSeo("Sunrise Market — marketplace ekosystemu Sunrise", "Płać portfelem Sunrise Pay, odbieraj 3% cashbacku i kupuj od zweryfikowanych sprzedawców.", "/");

  async function load(query: string | null, slug: string | null = null, sortOverride?: string, lim = 24) {
    if (lim > 24) setMore(true); else setLoading(true);
    setErr(null); setCurSlug(slug); setLimit(lim);
    try {
      setOffers(await searchOffers(query, slug, {
        sort: sortOverride ?? sort,
        priceMin: pMin ? Number(pMin) : null,
        priceMax: pMax ? Number(pMax) : null,
        limit: lim,
      }));
    }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); setMore(false); }
  }
  // ponów wyszukiwanie z aktualnymi filtrami (sort/cena)
  function rerun() { load(q || null, curSlug); }
  async function children(parentId?: string): Promise<Dept[]> {
    if (!parentId) return [];
    const { data } = await supabase.from("categories").select("id,slug,name")
      .eq("parent_id", parentId).order("sort_order");
    return (data as Dept[]) ?? [];
  }
  useEffect(() => {
    load(null);
    supabase.from("categories").select("id,slug,name").is("parent_id", null).order("sort_order")
      .then(({ data }) => setDepts((data as Dept[]) ?? []));
    categoryCounts().then(({ byId, total }) => { setCounts(byId); setTotal(total); }).catch(() => {});
    homePromoted().then((d) => setPromoted((d as any[]).map((o) => ({ ...o, score: 1 })) as Offer[])).catch(() => {});
    activeHomeBanners().then((b) => setBanners((b as Banner[]) ?? [])).catch(() => {});
    activeBanners("category_tile").then((b) => setTiles((b as Banner[]) ?? [])).catch(() => {});
    activeBanners("home_strip").then((b) => setStrips((b as Banner[]) ?? [])).catch(() => {});
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      if (data.user) {
        recommendedOffers(8).then((r) => setRecs(r as Offer[])).catch(() => {});
        watchedIds().then((ids) => setFavs(new Set(ids))).catch(() => {});
      }
    });
    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (urlQ) { setQ(urlQ); load(urlQ); }
  }, []);

  // rotacja banerow hero co 6 s
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setBi((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);

  // poziom 1: dział
  async function pickDept(d: Dept | null) {
    setActiveSub(null); setActiveSub2(null); setSubs2([]); setActiveDept(d); setQ("");
    if (!d) { setSubs([]); load(null); return; }
    load(null, d.slug);
    setSubs(await children(d.id));
  }
  // poziom 2: podkategoria
  async function pickSub(s: Dept | null) {
    setActiveSub2(null); setActiveSub(s);
    if (!s) { setSubs2([]); load(null, activeDept?.slug ?? null); return; }
    load(null, s.slug);
    setSubs2(await children(s.id));
  }
  // poziom 3: pod-podkategoria
  function pickSub2(slug: string | null) {
    setActiveSub2(slug);
    load(null, slug ?? activeSub?.slug ?? activeDept?.slug ?? null);
  }

  const heading = activeSub2
    ? (subs2.find((s) => s.slug === activeSub2)?.name ?? "Oferty")
    : activeSub ? activeSub.name
    : activeDept ? activeDept.name : "🔥 Okazje tygodnia";

  function toggleFav(id: string) {
    if (!authed) { window.location.href = "/login"; return; }
    setFavs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); // optymistycznie
    toggleWatch(id).then((watched) => {
      setFavs((prev) => { const n = new Set(prev); watched ? n.add(id) : n.delete(id); return n; });
      if (wishMode) openWishlist(); // odśwież widok listy życzeń
    }).catch(() => {});
  }
  async function openWishlist() {
    setWishMode(true);
    try { setWish(await myWatchlist() as any[]); } catch { setWish([]); }
  }

  return (
    <div className="min-h-screen">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 backdrop-blur"
              style={{ background: "rgba(10,18,36,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg shadow-lg"
                 style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", boxShadow: "0 6px 20px -6px rgba(200,150,90,.6)" }}>☀</div>
            <span className="font-display text-xl font-semibold tracking-tight">Sunrise Market</span>
          </a>
          <div className="flex-1 flex items-center rounded-xl overflow-hidden"
               style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && load(q)}
                   placeholder="Szukaj produktów…"
                   className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-zinc-500" />
            <button onClick={() => load(q)} className="px-5 py-2 text-sm font-semibold text-black"
                    style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>Szukaj</button>
          </div>
          <a href="/sprzedawca" className="text-sm text-zinc-300 hover:text-white px-2 hidden md:block">Sprzedawaj</a>
          {!authed && <a href="/login" className="text-sm text-zinc-300 hover:text-white px-2 hidden sm:block">Zaloguj</a>}
          <ThemeToggle />
          <NotificationsBell />
          <a href="/koszyk" className="text-sm font-medium px-3 py-2 rounded-xl relative"
             style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            🛒 Koszyk{cartN > 0 ? ` (${cartN})` : ""}
          </a>
          {authed && <a href="/zamowienia" className="text-sm text-zinc-300 hover:text-white px-2 hidden md:block">Zamówienia</a>}
          {authed && <a href="/konto" className="text-sm font-medium px-3 py-2 rounded-xl hidden sm:block"
             style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>👤 Konto</a>}
        </div>
        {/* pasek działów */}
        <div className="mx-auto max-w-6xl px-4 pb-2 flex gap-2 overflow-x-auto">
          <Chip active={activeDept === null} onClick={() => pickDept(null)}>☰ Wszystkie{total ? ` (${total.toLocaleString("pl-PL")})` : ""}</Chip>
          {depts.map((d) => (
            <Chip key={d.slug} active={activeDept?.slug === d.slug} onClick={() => pickDept(d)}>
              {deptEmoji(d.name)} {d.name}{d.id && counts[d.id] ? <span style={{ opacity: .6 }}> ({counts[d.id]})</span> : null}
            </Chip>
          ))}
        </div>
        {/* poziom 2: podkategorie */}
        {activeDept && subs.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 pb-2 flex gap-2 overflow-x-auto">
            <Chip active={activeSub === null} onClick={() => pickSub(null)}>Wszystko w: {activeDept.name}</Chip>
            {subs.map((s) => (
              <Chip key={s.slug} active={activeSub?.slug === s.slug} onClick={() => pickSub(s)}>{s.name}{s.id && counts[s.id] ? <span style={{ opacity: .6 }}> ({counts[s.id]})</span> : null}</Chip>
            ))}
          </div>
        )}
        {/* poziom 3: pod-podkategorie */}
        {activeSub && subs2.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 pb-3 flex gap-2 overflow-x-auto" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <Chip active={activeSub2 === null} onClick={() => pickSub2(null)}>Wszystko w: {activeSub.name}</Chip>
            {subs2.map((s) => (
              <Chip key={s.slug} active={activeSub2 === s.slug} onClick={() => pickSub2(s.slug)}>{s.name}</Chip>
            ))}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-5"><FamilyClubBanner /></div>

      {/* ── BANER REKLAMOWY (hero slot, rotacja) ── */}
      {banners.length > 0 && (() => {
        const b = banners[bi] ?? banners[0];
        return (
          <div className="mx-auto max-w-6xl px-4 pt-5">
            <a href={b.link_url || "/"} className="block rounded-2xl overflow-hidden relative"
               style={{ border: "1px solid rgba(200,150,90,.28)", boxShadow: "0 18px 50px -22px rgba(200,150,90,.4)" }}>
              {b.image_url ? (
                <picture>
                  <source media="(max-width: 640px)" srcSet={b.image_url.replace(/(\.\w+)$/, "_m$1")} />
                  <img src={b.image_url} alt={b.headline} loading="eager" width={1300} height={360}
                       className="block w-full h-auto" />
                </picture>
              ) : (
                <div className="flex items-center px-8 py-10"
                     style={{ background: "linear-gradient(135deg, rgba(200,150,90,.25), rgba(90,138,229,.25))" }}>
                  <div>
                    <div className="text-[11px] font-semibold tracking-wider mb-2" style={{ color: "var(--gold)" }}>SPONSOROWANE · {b.seller}</div>
                    <div className="font-display text-2xl sm:text-3xl font-semibold max-w-xl">{b.headline}</div>
                  </div>
                </div>
              )}
              {banners.length > 1 && (
                <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
                  {banners.map((_, i) => (
                    <button key={i} aria-label={`Baner ${i + 1}`} onClick={(e) => { e.preventDefault(); setBi(i); }}
                      className="rounded-full transition-all"
                      style={{ width: i === bi ? 20 : 7, height: 7, background: i === bi ? "var(--gold)" : "rgba(255,255,255,.45)" }} />
                  ))}
                </div>
              )}
            </a>
          </div>
        );
      })()}

      {/* ── HERO ── */}
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-8 text-center">
        <div className="inline-block text-xs font-semibold tracking-wider mb-4 px-3 py-1 rounded-full"
             style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--gold)" }}>
          PŁATNOŚĆ SUNRISE PAY · CASHBACK 3% NA PORTFEL
        </div>
        <h1 className="font-display font-semibold leading-[1.05] text-5xl sm:text-6xl">
          Zakupy w innym <span style={{ color: "var(--primary)" }}>wymiarze</span>.
        </h1>
        <p className="mt-4 text-base sm:text-lg max-w-xl mx-auto" style={{ color: "var(--mut)" }}>
          Marketplace ekosystemu Sunrise. Płacisz portfelem, dostajesz 3% z powrotem,
          a Suri pomaga wybrać najlepszą ofertę.
        </p>
      </section>

      {/* ── STREFA ENERGII SUNRISE (kafle kategorii 640x360) ── */}
      {!activeDept && tiles.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-2">
          <h2 className="font-display text-2xl font-semibold mb-5">⚡ Strefa Energii Sunrise</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
            {tiles.map((t, i) => (
              <a key={i} href={t.link_url || "/"} className="block rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
                 style={{ border: "1px solid var(--line)", boxShadow: "0 10px 30px -18px rgba(0,0,0,.6)" }}>
                <img src={t.image_url!} alt={t.headline} loading="lazy" width={640} height={360} className="block w-full h-auto" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── DLA CIEBIE (rekomendacje wg preferencji) ── */}
      {!activeDept && authed && recs.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4 pt-2">
          <h2 className="font-display text-2xl font-semibold mb-5">💛 Dla Ciebie</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
            {recs.map((o) => (
              <OfferCard key={"r" + o.offer_id} o={o} fav={favs.has(o.offer_id)} onToggleFav={toggleFav} badge="Dla Ciebie" />
            ))}
          </div>
        </section>
      )}

      {/* ── WYRÓŻNIONE / PROMOWANE ── */}
      {!activeDept && promoted.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <h2 className="font-display text-2xl font-semibold mb-5">✨ Wyróżnione</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
            {promoted.map((o) => (
              <OfferCard key={"p" + o.offer_id} o={o} fav={favs.has(o.offer_id)} onToggleFav={toggleFav} badge={(o as any).kind ?? "Wyróżnione"} />
            ))}
          </div>
        </section>
      )}

      {/* ── PASEK PROMOCYJNY (strip 1300x220, rotacja) ── */}
      {!activeDept && strips.length > 0 && (() => {
        const sB = strips[bi % strips.length];
        return (
          <div className="mx-auto max-w-6xl px-4 pb-8">
            <a href={sB.link_url || "/"} className="block rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
              <img src={sB.image_url!} alt={sB.headline} loading="lazy" width={1300} height={220} className="block w-full h-auto" />
            </a>
          </div>
        );
      })()}

      {/* ── OFERTY ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-display text-2xl font-semibold">{wishMode ? "♥ Lista życzeń" : heading}</h2>
          {authed && (
            <button onClick={() => (wishMode ? setWishMode(false) : openWishlist())}
                    className="text-sm px-3 py-1.5 rounded-xl"
                    style={{ background: wishMode ? "linear-gradient(135deg,#C8965A,#A97B42)" : "var(--glass)", border: "1px solid var(--line)", color: wishMode ? "#000" : "var(--ink)", fontWeight: wishMode ? 600 : 400 }}>
              {wishMode ? "← Wróć do ofert" : `♥ Lista życzeń${favs.size ? ` (${favs.size})` : ""}`}
            </button>
          )}
        </div>

        {/* pasek sortowania + filtr ceny (ukryty w widoku listy życzeń) */}
        {!wishMode && (
          <div className="flex items-center gap-2 mb-5 flex-wrap text-sm">
            <span style={{ color: "var(--mut)" }}>Sortuj:</span>
            <select value={sort} onChange={(e) => { setSort(e.target.value); load(q || null, curSlug, e.target.value); }}
                    className="rounded-lg px-3 py-1.5 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>
              <option value="trafnosc">Trafność</option>
              <option value="cena_rosnaco">Cena: rosnąco</option>
              <option value="cena_malejaco">Cena: malejąco</option>
              <option value="oceny">Najlepiej oceniane</option>
              <option value="najnowsze">Najnowsze</option>
            </select>
            <span className="ml-2" style={{ color: "var(--mut)" }}>Cena:</span>
            <input value={pMin} onChange={(e) => setPMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="od"
                   className="w-20 rounded-lg px-2 py-1.5 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
            <input value={pMax} onChange={(e) => setPMax(e.target.value.replace(/[^0-9]/g, ""))} placeholder="do"
                   className="w-20 rounded-lg px-2 py-1.5 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
            <button onClick={rerun} className="px-3 py-1.5 rounded-lg font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Filtruj</button>
            {(pMin || pMax || sort !== "trafnosc") && (
              <button onClick={() => { setPMin(""); setPMax(""); setSort("trafnosc"); load(q || null, curSlug, "trafnosc"); }}
                      className="px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyczyść</button>
            )}
            <span className="ml-auto" style={{ color: "var(--mut)" }}>{offers.length} ofert</span>
          </div>
        )}

        {loading && !wishMode && (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
            {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}
        {err && <p className="text-rose-400">Błąd: {err}</p>}

        {wishMode ? (
          wish.length === 0
            ? <p style={{ color: "var(--mut)" }}>Twoja lista życzeń jest pusta. Kliknij ♡ na produkcie, aby dodać.</p>
            : <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
                {wish.map((o) => (
                  <OfferCard key={"w" + o.offer_id} o={o} fav={favs.has(o.offer_id)} onToggleFav={toggleFav} badge={o.price_dropped ? "Cena spadła" : undefined} />
                ))}
              </div>
        ) : (
          <>
            {!loading && !err && offers.length === 0 && (
              <div className="rounded-2xl p-8 text-center" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <div className="text-lg font-semibold mb-1">Nic tu jeszcze nie ma</div>
                <p className="text-sm mb-4" style={{ color: "var(--mut)" }}>W tej kategorii nie znaleźliśmy ofert. Zajrzyj do innej albo zobacz wszystko.</p>
                <button onClick={() => { setActiveDept(null); setActiveSub(null); setActiveSub2(null); load(null, null); }}
                        className="text-sm font-semibold px-5 py-2 rounded-xl text-black"
                        style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                  Pokaż wszystkie oferty
                </button>
              </div>
            )}
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
              {offers.map((o) => (
                <OfferCard key={o.offer_id} o={o} fav={favs.has(o.offer_id)} onToggleFav={toggleFav} />
              ))}
            </div>

            {/* Doładowanie kolejnej partii. Gdy wróciło mniej niż prosiliśmy — to już koniec listy. */}
            {!loading && offers.length >= limit && (
              <div className="flex justify-center mt-8">
                <button onClick={() => load(q || null, curSlug, undefined, limit + 24)} disabled={more}
                        className="text-sm font-semibold px-6 py-3 rounded-xl"
                        style={{ background: "var(--glass)", border: "1px solid var(--line)", opacity: more ? .6 : 1 }}>
                  {more ? "Wczytuję…" : "Pokaż więcej ofert"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs" style={{ color: "var(--mut)", borderTop: "1px solid var(--line)" }}>
        <div className="flex flex-wrap gap-4 justify-center mb-2">
          <a href="/cennik" className="hover:text-amber-300">Cennik</a>
          <a href="/sprzedawca" className="hover:text-amber-300">Zostań sprzedawcą</a>
          <a href="/legal/zwroty.html" className="hover:text-amber-300">Zwroty i reklamacje</a>
          <a href="/legal/regulamin.html" className="hover:text-amber-300">Regulamin</a>
        </div>
        Sunrise Market · Płatność wyłącznie Sunrise Pay · Cashback 3%
      </footer>
      <SuriChat />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className="shrink-0 text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
            style={active
              ? { background: "linear-gradient(135deg,#C8965A,#A97B42)", color: "#000", fontWeight: 600 }
              : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>
      {children}
    </button>
  );
}
