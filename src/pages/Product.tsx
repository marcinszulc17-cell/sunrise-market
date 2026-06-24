import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer } from "../lib/api";

type Offer = {
  offer_id: string; title: string; description: string | null; price_gross: number;
  stock: number; status: string; category: string; category_slug: string;
  seller: string; seller_id: string;
};

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";

function visual(t: string): { emoji: string; from: string; to: string } {
  const s = t.toLowerCase();
  const O = "#F2731D", G = "#E0A21B", GR = "#34E3A0", CY = "#38E0F0", VI = "#A78BFA", PU = "#7C3AED", PK = "#F25CB0";
  if (s.includes("panel") || s.includes("fotowolt")) return { emoji: "🔆", from: O, to: G };
  if (s.includes("magazyn") || s.includes("inwerter")) return { emoji: "🔋", from: GR, to: CY };
  if (s.includes("pompa") || s.includes("kolektor")) return { emoji: "♨️", from: O, to: PK };
  if (s.includes("smartfon")) return { emoji: "📱", from: CY, to: VI };
  if (s.includes("słuchaw") || s.includes("audio")) return { emoji: "🎧", from: VI, to: PU };
  if (s.includes("laptop") || s.includes("komputer")) return { emoji: "💻", from: CY, to: PU };
  if (s.includes("kamera") || s.includes("foto")) return { emoji: "📷", from: VI, to: CY };
  if (s.includes("ekspres") || s.includes("odkurz") || s.includes("agd")) return { emoji: "🧺", from: CY, to: GR };
  if (s.includes("kurtk") || s.includes("sneaker") || s.includes("moda")) return { emoji: "👟", from: PK, to: VI };
  if (s.includes("fotelik") || s.includes("dziecko")) return { emoji: "🍼", from: PK, to: G };
  if (s.includes("rower") || s.includes("namiot") || s.includes("sport")) return { emoji: "🚴", from: GR, to: CY };
  if (s.includes("szczotecz") || s.includes("uroda")) return { emoji: "💆", from: PK, to: O };
  if (s.includes("karma") || s.includes("zwierz")) return { emoji: "🐾", from: G, to: GR };
  if (s.includes("kawa") || s.includes("supermarket")) return { emoji: "🛒", from: O, to: G };
  if (s.includes("licznik") || s.includes("energi") || s.includes("oze")) return { emoji: "⚡", from: G, to: O };
  return { emoji: "🌅", from: O, to: "#D9560C" };
}

export default function Product() {
  const { id } = useParams();
  const [o, setO] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((d) => setO(d as Offer)).catch((e) => setErr(String((e as Error).message))).finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg"
                 style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="text-sm text-zinc-300 hover:text-white">← Wróć</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
        {err && <p className="text-rose-400">Błąd: {err}</p>}
        {!loading && !o && <p style={{ color: "var(--mut)" }}>Nie znaleziono produktu. <a href="/" className="text-amber-400 underline">Wróć do sklepu</a>.</p>}

        {o && (
          <div className="grid gap-8 md:grid-cols-2">
            {/* obraz */}
            <div className="rounded-3xl grid place-items-center text-8xl h-80 md:h-full min-h-80"
                 style={{ background: `radial-gradient(220px 160px at 50% 35%, ${visual(o.title + o.category).from}33, transparent 70%), linear-gradient(135deg, ${visual(o.title + o.category).from}22, ${visual(o.title + o.category).to}22)`, border: "1px solid var(--line)" }}>
              {visual(o.title + o.category).emoji}
            </div>

            {/* szczegóły */}
            <div className="flex flex-col gap-4">
              <a href={`/?dzial=${o.category_slug}`} className="text-sm" style={{ color: "var(--mut)" }}>
                {o.seller} · {o.category}
              </a>
              <h1 className="font-display text-3xl font-semibold leading-tight">{o.title}</h1>

              <div className="flex items-center gap-3">
                <div className="font-display text-4xl font-bold">{zl(o.price_gross)}</div>
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                      style={{ background: "rgba(52,227,160,.12)", color: "var(--green)" }}>
                  +{zl(o.price_gross * 0.03)} cashback na portfel
                </span>
              </div>

              <div className="text-sm" style={{ color: o.stock > 0 ? "var(--green)" : "#F25CB0" }}>
                {o.stock > 0 ? `Dostępne: ${o.stock} szt.` : "Chwilowo niedostępne"}
              </div>

              {o.description && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{o.description}</p>
              )}

              <div className="flex gap-3 mt-2">
                <a href="/login" className="flex-1 text-center font-semibold py-3 rounded-2xl text-black"
                   style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>
                  Do koszyka
                </a>
                <a href="/portfel" className="px-5 py-3 rounded-2xl text-sm font-medium"
                   style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  Portfel
                </a>
              </div>

              <div className="mt-2 rounded-2xl p-4 text-xs" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>
                Płatność wyłącznie <b style={{ color: "var(--gold)" }}>Sunrise Pay</b> (saldo portfela). Cashback 3% wraca na portfel po zakupie.
                Ochrona kupującego i zwroty na saldo. Prowizja platformy 7,9%.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
