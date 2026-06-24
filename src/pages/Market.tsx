import { useEffect, useMemo, useState } from "react";
import { searchOffers } from "../lib/api";
import { supabase } from "../lib/supabase";

type Offer = { offer_id: string; title: string; price_gross: number; category: string; seller: string; score: number };
type Dept = { slug: string; name: string };

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

export default function Market() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [depts, setDepts] = useState<Dept[]>([]);

  async function load(query: string | null) {
    setLoading(true); setErr(null);
    try { setOffers(await searchOffers(query)); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load(null);
    supabase.from("categories").select("slug,name").is("parent_id", null).order("sort_order")
      .then(({ data }) => setDepts((data as Dept[]) ?? []));
  }, []);

  // ile ofert w danym dziale (po nazwie)
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    offers.forEach((o) => { m[o.category] = (m[o.category] ?? 0) + 1; });
    return m;
  }, [offers]);

  const shown = activeCat ? offers.filter((o) => o.category === activeCat) : offers;

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
          <a href="/login" className="text-sm text-zinc-300 hover:text-white px-2 hidden sm:block">Zaloguj</a>
          <a href="/portfel" className="text-sm font-medium px-3 py-2 rounded-xl"
             style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🛒 Portfel</a>
        </div>
        {/* pasek działów */}
        <div className="mx-auto max-w-6xl px-4 pb-3 flex gap-2 overflow-x-auto">
          <Chip active={activeCat === null} onClick={() => setActiveCat(null)}>☰ Wszystkie</Chip>
          {depts.map((d) => (
            <Chip key={d.slug} active={activeCat === d.name} onClick={() => setActiveCat(d.name)}>
              {deptEmoji(d.name)} {d.name}{counts[d.name] ? ` ${counts[d.name]}` : ""}
            </Chip>
          ))}
        </div>
      </header>

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

      {/* ── OFERTY ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-2xl font-semibold">🔥 Okazje tygodnia</h2>
          <span className="text-sm" style={{ color: "var(--mut)" }}>{shown.length} ofert</span>
        </div>

        {loading && <p style={{ color: "var(--mut)" }}>Ładowanie ofert…</p>}
        {err && <p className="text-rose-400">Błąd: {err}</p>}
        {!loading && !err && shown.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert w tej kategorii.</p>}

        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {shown.map((o) => {
            const v = catVisual(o.category, o.title);
            const cb = o.price_gross * 0.03;
            const fav = favs.has(o.offer_id);
            return (
              <article key={o.offer_id} className="card-glow rounded-2xl overflow-hidden flex flex-col"
                       style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <div className="relative h-36 grid place-items-center text-5xl"
                     style={{ background: `radial-gradient(120px 80px at 50% 30%, ${v.from}33, transparent 70%), linear-gradient(135deg, ${v.from}22, ${v.to}22)` }}>
                  <span>{v.emoji}</span>
                  <button onClick={() => toggleFav(o.offer_id)}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full grid place-items-center text-sm"
                          style={{ background: "rgba(7,7,15,.5)", border: "1px solid var(--line)", color: fav ? "#F25CB0" : "#fff" }}>
                    {fav ? "♥" : "♡"}
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="text-xs" style={{ color: "var(--mut)" }}>{o.seller} · {o.category}</div>
                  <div className="font-semibold leading-snug flex-1">{o.title}</div>
                  <div className="flex items-end justify-between">
                    <div className="font-display text-2xl font-semibold">{zl(o.price_gross)}</div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                          style={{ background: "rgba(52,227,160,.12)", color: "var(--green)" }}>
                      +{zl(cb)} cashback
                    </span>
                  </div>
                  <a href="/login" className="mt-1 text-center text-sm font-semibold py-2 rounded-xl text-black"
                     style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>
                    Do koszyka
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs" style={{ color: "var(--mut)", borderTop: "1px solid var(--line)" }}>
        Sunrise Market · Płatność wyłącznie Sunrise Pay · Cashback 3% · Prowizja 7,9%
      </footer>
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
