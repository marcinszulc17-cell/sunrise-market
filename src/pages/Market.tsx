import { useEffect, useState } from "react";
import { searchOffers, homePromoted, activeHomeBanner } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useCart } from "../lib/cart";
import SuriChat from "../components/SuriChat";
import NotificationsBell from "../components/NotificationsBell";
import { useSeo } from "../lib/seo";

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

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";

// wizual karty wg kategorii / nazwy produktu (emoji + gradient poświaty)
function catVisual(cat: string, title = ""): { emoji: string; from: string; to: string } {
  const t = (cat + " " + title).toLowerCase();
  const O = "#F2731D", G = "#E0A21B", GR = "#34E3A0", CY = "#38E0F0", VI = "#A78BFA", PU = "#7C3AED", PK = "#F25CB0";
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
  return { emoji: "🌅", from: O, to: "#D9560C" };
}

// emoji dla chipa działu
function deptEmoji(name: string) { return catVisual(name).emoji; }

function OfferCard({ o, fav, onToggleFav, badge }: { o: Offer; fav: boolean; onToggleFav: (id: string) => void; badge?: string }) {
  const v = catVisual(o.category, o.title);
  const cb = o.price_gross * 0.03;
  return (
    <article className="card-glow rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <a href={`/produkt/${o.offer_id}`} className="relative h-36 grid place-items-center text-5xl overflow-hidden"
         style={{ background: `radial-gradient(120px 80px at 50% 30%, ${v.from}33, transparent 70%), linear-gradient(135deg, ${v.from}22, ${v.to}22)` }}>
        {o.image_url
          ? <img src={o.image_url} alt={o.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          : <span>{v.emoji}</span>}
        {badge && <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>{badge}</span>}
        <button onClick={(e) => { e.preventDefault(); onToggleFav(o.offer_id); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center text-sm"
                style={{ background: "rgba(7,7,15,.5)", border: "1px solid var(--line)", color: fav ? "#F25CB0" : "#fff" }}>
          {fav ? "♥" : "♡"}
        </button>
      </a>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-xs" style={{ color: "var(--mut)" }}>{o.seller} · {o.category}</div>
        <Stars rating={o.rating} reviews={o.reviews} />
        <a href={`/produkt/${o.offer_id}`} className="font-semibold leading-snug flex-1 hover:text-amber-300">{o.title}</a>
        <div className="flex items-end justify-between">
          <div className="font-display text-2xl font-semibold">{zl(o.price_gross)}</div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(52,227,160,.12)", color: "var(--green)" }}>+{zl(cb)} cashback</span>
        </div>
        <a href={`/produkt/${o.offer_id}`} className="mt-1 text-center text-sm font-semibold py-2 rounded-xl text-black"
           style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Zobacz</a>
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
  const [banner, setBanner] = useState<{ headline: string; link_url: string; image_url: string | null; seller: string } | null>(null);
  const [authed, setAuthed] = useState(false);
  useSeo("Sunrise Market — marketplace ekosystemu Sunrise", "Płać portfelem Sunrise Pay, odbieraj 3% cashbacku i kupuj od zweryfikowanych sprzedawców.", "/");

  async function load(query: string | null, slug: string | null = null) {
    setLoading(true); setErr(null);
    try { setOffers(await searchOffers(query, slug)); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }
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
    homePromoted().then((d) => setPromoted((d as any[]).map((o) => ({ ...o, score: 1 })) as Offer[])).catch(() => {});
    activeHomeBanner().then((b) => setBanner(b as any)).catch(() => {});
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (urlQ) { setQ(urlQ); load(urlQ); }
  }, []);

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
    setFavs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="min-h-screen">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 backdrop-blur"
              style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg shadow-lg"
                 style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)", boxShadow: "0 6px 20px -6px rgba(242,115,29,.6)" }}>☀</div>
            <span className="font-display text-xl font-semibold tracking-tight">Sunrise Market</span>
          </a>
          <div className="flex-1 flex items-center rounded-xl overflow-hidden"
               style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && load(q)}
                   placeholder="Szukaj produktów…"
                   className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-zinc-500" />
            <button onClick={() => load(q)} className="px-5 py-2 text-sm font-semibold text-black"
                    style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>Szukaj</button>
          </div>
          <a href="/sprzedawca" className="text-sm text-zinc-300 hover:text-white px-2 hidden md:block">Sprzedawaj</a>
          {!authed && <a href="/login" className="text-sm text-zinc-300 hover:text-white px-2 hidden sm:block">Zaloguj</a>}
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
          <Chip active={activeDept === null} onClick={() => pickDept(null)}>☰ Wszystkie</Chip>
          {depts.map((d) => (
            <Chip key={d.slug} active={activeDept?.slug === d.slug} onClick={() => pickDept(d)}>
              {deptEmoji(d.name)} {d.name}
            </Chip>
          ))}
        </div>
        {/* poziom 2: podkategorie */}
        {activeDept && subs.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 pb-2 flex gap-2 overflow-x-auto">
            <Chip active={activeSub === null} onClick={() => pickSub(null)}>Wszystko w: {activeDept.name}</Chip>
            {subs.map((s) => (
              <Chip key={s.slug} active={activeSub?.slug === s.slug} onClick={() => pickSub(s)}>{s.name}</Chip>
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

      {/* ── BANER REKLAMOWY (hero slot) ── */}
      {banner && (
        <a href={banner.link_url || "/"} className="block mx-auto max-w-6xl px-4 pt-5">
          <div className="rounded-2xl overflow-hidden relative flex items-center px-8 py-10"
               style={{ background: banner.image_url ? `url(${banner.image_url}) center/cover` : "linear-gradient(135deg, rgba(242,115,29,.25), rgba(124,58,237,.25))", border: "1px solid rgba(242,115,29,.35)" }}>
            <div>
              <div className="text-[11px] font-semibold tracking-wider mb-2" style={{ color: "var(--gold)" }}>SPONSOROWANE · {banner.seller}</div>
              <div className="font-display text-2xl sm:text-3xl font-semibold max-w-xl">{banner.headline}</div>
            </div>
          </div>
        </a>
      )}

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

      {/* ── OFERTY ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-2xl font-semibold">{heading}</h2>
          <span className="text-sm" style={{ color: "var(--mut)" }}>{offers.length} ofert</span>
        </div>

        {loading && <p style={{ color: "var(--mut)" }}>Ładowanie ofert…</p>}
        {err && <p className="text-rose-400">Błąd: {err}</p>}
        {!loading && !err && offers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert w tej kategorii — wybierz inną lub wróć do „Wszystkie".</p>}

        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {offers.map((o) => (
            <OfferCard key={o.offer_id} o={o} fav={favs.has(o.offer_id)} onToggleFav={toggleFav} />
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs" style={{ color: "var(--mut)", borderTop: "1px solid var(--line)" }}>
        <div className="flex flex-wrap gap-4 justify-center mb-2">
          <a href="/cennik" className="hover:text-amber-300">Cennik</a>
          <a href="/sprzedawca" className="hover:text-amber-300">Zostań sprzedawcą</a>
          <a href="/legal/regulamin.html" className="hover:text-amber-300">Regulamin</a>
        </div>
        Sunrise Market · Płatność wyłącznie Sunrise Pay · Cashback 3% · Prowizja 7,9%
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
              ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000", fontWeight: 600 }
              : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>
      {children}
    </button>
  );
}
