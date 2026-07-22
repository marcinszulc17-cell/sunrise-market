import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer, offerReviews, addReview, offerImages, trackView, similarOffers } from "../lib/api";
import { addToCart } from "../lib/cart";
import { supabase } from "../lib/supabase";
import { useSeo, useProductJsonLd } from "../lib/seo";

type Offer = {
  offer_id: string; title: string; description: string | null; price_gross: number;
  stock: number; status: string; category: string; category_slug: string;
  seller: string; seller_id: string; avg_rating: number; review_count: number; image_url: string | null;
  attributes?: {
    colors?: string[]; sizes?: string[]; specs?: Record<string, string>;
    features?: string[]; packing?: string[]; video?: string | null;
  } | null;
};
type Review = { rating: number; comment: string | null; author: string; created_at: string };

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
function stars(n: number) { const f = Math.round(n); return "★".repeat(f) + "☆".repeat(5 - f); }

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [authed, setAuthed] = useState(false);
  const [myRating, setMyRating] = useState(5);
  const [myComment, setMyComment] = useState("");
  const [revMsg, setRevMsg] = useState<string | null>(null);

  useSeo(o ? o.title : "Produkt", o ? `${o.title} — ${zl(o.price_gross)}. ${(o.description ?? "").slice(0, 140)}` : "Produkt w Sunrise Market.", id ? `/produkt/${id}` : "");
  useProductJsonLd(o ? { id: o.offer_id, name: o.title, price: o.price_gross, image: o.image_url, rating: o.avg_rating, reviews: o.review_count } : null);

  const [imgs, setImgs] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [color, setColor] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [similar, setSimilar] = useState<any[]>([]);
  const A = o?.attributes || {};
  const colors = A.colors ?? [];
  const sizes = A.sizes ?? [];
  const specs = A.specs ?? {};
  const features = A.features ?? [];
  const packing = A.packing ?? [];
  const needColor = colors.length > 0 && !color;
  const needSize = sizes.length > 0 && !size;
  const variantLabel = [color && `Kolor: ${color}`, size && `Rozmiar: ${size}`].filter(Boolean).join(", ");

  async function loadReviews(oid: string) { setReviews((await offerReviews(oid)) as Review[]); }

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((d) => setO(d as Offer)).catch((e) => setErr(String((e as Error).message))).finally(() => setLoading(false));
    loadReviews(id).catch(() => {});
    offerImages(id).then((u) => { setImgs(u); setActive(0); }).catch(() => {});
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    trackView(id);
    similarOffers(id, 8).then(setSimilar).catch(() => {});
  }, [id]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault(); setRevMsg(null);
    if (!id) return;
    try {
      await addReview(id, myRating, myComment);
      setMyComment("");
      await loadReviews(id);
      const fresh = await getOffer(id); setO(fresh as Offer);
      setRevMsg("Dziękujemy za opinię!");
    } catch (e) { setRevMsg((e as Error).message); }
  }

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

        {o && (<>
          <div className="grid gap-8 md:grid-cols-2">
            {/* galeria */}
            <div className="flex flex-col gap-3">
              <div className="rounded-3xl grid place-items-center text-8xl h-96 overflow-hidden"
                   style={{ background: `radial-gradient(220px 160px at 50% 35%, ${visual(o.title + o.category).from}33, transparent 70%), linear-gradient(135deg, ${visual(o.title + o.category).from}22, ${visual(o.title + o.category).to}22)`, border: "1px solid var(--line)" }}>
                {(imgs[active] || o.image_url)
                  ? <img src={imgs[active] || o.image_url!} alt={o.title} className="w-full h-full object-cover" />
                  : visual(o.title + o.category).emoji}
              </div>
              {imgs.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {imgs.map((u, i) => (
                    <button key={i} onClick={() => setActive(i)} className="w-16 h-16 rounded-xl overflow-hidden shrink-0"
                            style={{ border: active === i ? "2px solid var(--primary)" : "1px solid var(--line)" }}>
                      <img src={u} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {A.video && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                  <video src={A.video} controls playsInline preload="metadata" poster={imgs[0] || o.image_url || undefined}
                         className="w-full h-auto bg-black" style={{ maxHeight: 360 }} />
                  <div className="text-xs px-3 py-2" style={{ color: "var(--mut)" }}>🎬 Wideo produktu</div>
                </div>
              )}
            </div>

            {/* szczegóły */}
            <div className="flex flex-col gap-4">
              <a href={`/?dzial=${o.category_slug}`} className="text-sm" style={{ color: "var(--mut)" }}>
                {o.seller} · {o.category}
              </a>
              <h1 className="font-display text-3xl font-semibold leading-tight">{o.title}</h1>
              <div className="text-sm">
                {o.review_count > 0
                  ? <span style={{ color: "var(--gold)" }}>{stars(o.avg_rating)} <span style={{ color: "var(--mut)" }}>{o.avg_rating.toFixed(1)} · {o.review_count} opinii</span></span>
                  : <span style={{ color: "var(--mut)" }}>Brak opinii — bądź pierwszy</span>}
              </div>

              <div className="flex items-center gap-3">
                <div className="font-display text-4xl font-bold">{zl(o.price_gross)}</div>
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                      style={{ background: "rgba(52,227,160,.12)", color: "var(--green)" }}>
                  +{Math.round(o.price_gross * 0.03).toLocaleString("pl-PL")} pkt na portfel
                </span>
              </div>

              <div className="text-sm" style={{ color: o.stock > 0 ? "var(--green)" : "#F25CB0" }}>
                {o.stock > 0 ? `Dostępne: ${o.stock} szt.` : "Chwilowo niedostępne"}
              </div>
              {(() => {
                const fp = (o as any).fulfillment_provider;
                const eta = (o as any).delivery_eta || (o as any).attributes?.delivery_eta;
                const txt = fp === "teemdrop" ? `🚚 Dostawa kurierem: ${eta || "15–25 dni roboczych"} (wysyłka z magazynu partnera)`
                          : fp === "mysunrise" ? "🔧 Montaż i dostawa po ustaleniu terminu z instalatorem Sunrise"
                          : "🚚 Wysyłka: Paczkomat InPost lub kurier · darmowa dostawa od 149 zł";
                return <div className="text-xs" style={{ color: "var(--mut)" }}>{txt}</div>;
              })()}

              {colors.length > 0 && (
                <div>
                  <div className="text-sm mb-2" style={{ color: "var(--mut)" }}>Kolor{color ? `: ${color}` : ""}</div>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => (
                      <button key={c} onClick={() => setColor(c)} className="text-sm px-3 py-1.5 rounded-xl"
                              style={color === c ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)" }}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              {sizes.length > 0 && (
                <div>
                  <div className="text-sm mb-2" style={{ color: "var(--mut)" }}>Rozmiar{size ? `: ${size}` : ""}</div>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((s) => (
                      <button key={s} onClick={() => setSize(s)} className="min-w-10 text-sm px-3 py-1.5 rounded-xl"
                              style={size === s ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)" }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {o.description && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--mut)" }}>
                  {o.description.split(/\n\s*\n/)[0].slice(0, 220)}{o.description.length > 220 ? "…" : ""}
                </p>
              )}

              {(needColor || needSize) && (
                <div className="text-xs" style={{ color: "var(--gold)" }}>
                  Wybierz {needColor ? "kolor" : ""}{needColor && needSize ? " i " : ""}{needSize ? "rozmiar" : ""}, aby dodać do koszyka.
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  disabled={needColor || needSize}
                  onClick={() => { addToCart({ offer_id: o.offer_id, title: o.title, price: o.price_gross, variant: variantLabel || undefined }); window.location.href = "/koszyk"; }}
                  className="flex-1 text-center font-semibold py-3 rounded-2xl text-black disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>
                  Do koszyka
                </button>
                <a href="/koszyk" className="px-5 py-3 rounded-2xl text-sm font-medium"
                   style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  Koszyk
                </a>
              </div>

              <div className="mt-2 rounded-2xl p-4 text-xs" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>
                Płatność wyłącznie <b style={{ color: "var(--gold)" }}>Sunrise Pay</b> (saldo portfela). Cashback 3% wraca na portfel po zakupie.
                Ochrona kupującego i zwroty na saldo.
              </div>
            </div>
          </div>

          {/* ── OPIS PRODUKTU ── */}
          {o.description && (
            <section className="mt-12 max-w-3xl">
              <h2 className="font-display text-2xl font-semibold mb-4">Opis produktu</h2>
              <div className="flex flex-col gap-4">
                {o.description.split(/\n\s*\n/).filter(Boolean).map((par, i) => (
                  <p key={i} className="leading-relaxed" style={{ color: "var(--ink)" }}>{par.trim()}</p>
                ))}
              </div>
            </section>
          )}

          {/* ── CECHY / SPECYFIKACJA / ZESTAW ── */}
          {(features.length > 0 || Object.keys(specs).length > 0 || packing.length > 0) && (
            <section className="mt-10 grid gap-8 md:grid-cols-2 max-w-4xl">
              {features.length > 0 && (
                <div className="md:col-span-2">
                  <h2 className="font-display text-2xl font-semibold mb-4">Najważniejsze cechy</h2>
                  <ul className="flex flex-col gap-2">
                    {features.map((f, i) => (
                      <li key={i} className="flex gap-2 leading-relaxed" style={{ color: "var(--ink)" }}>
                        <span style={{ color: "var(--green)" }}>✓</span><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(specs).length > 0 && (
                <div>
                  <h2 className="font-display text-2xl font-semibold mb-4">Specyfikacja</h2>
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                    {Object.entries(specs).map(([k, v], i) => (
                      <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm"
                           style={{ background: i % 2 ? "transparent" : "var(--glass)", borderBottom: "1px solid var(--line)" }}>
                        <span style={{ color: "var(--mut)" }}>{k}</span>
                        <span className="text-right font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {packing.length > 0 && (
                <div>
                  <h2 className="font-display text-2xl font-semibold mb-4">Zawartość zestawu</h2>
                  <ul className="flex flex-col gap-2">
                    {packing.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--ink)" }}>
                        <span style={{ color: "var(--gold)" }}>•</span><span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* ── PODOBNE PRODUKTY ── */}
          {similar.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-2xl font-semibold mb-4">Podobne produkty</h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
                {similar.map((s: any) => (
                  <a key={s.offer_id} href={`/produkt/${s.offer_id}`} className="rounded-2xl overflow-hidden"
                     style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="h-28 grid place-items-center overflow-hidden"
                         style={{ background: "linear-gradient(135deg,#F2731D22,#7C3AED22)" }}>
                      {s.image_url ? <img src={s.image_url} alt={s.title} className="w-full h-full object-cover" loading="lazy" /> : <span className="text-3xl">🌅</span>}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium leading-snug">{String(s.title).slice(0, 60)}</div>
                      <div className="font-display font-semibold mt-1">{zl(s.price_gross)}</div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── OPINIE ── */}
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold mb-4">Opinie {o.review_count > 0 && <span style={{ color: "var(--mut)" }}>({o.review_count})</span>}</h2>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="md:col-span-2 flex flex-col gap-3">
                {reviews.map((r, i) => (
                  <div key={i} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between">
                      <span style={{ color: "var(--gold)" }}>{stars(r.rating)}</span>
                      <span className="text-xs" style={{ color: "var(--mut)" }}>{r.author} · {new Date(r.created_at).toLocaleDateString("pl-PL")}</span>
                    </div>
                    {r.comment && <p className="text-sm mt-2">{r.comment}</p>}
                  </div>
                ))}
                {reviews.length === 0 && <p style={{ color: "var(--mut)" }}>Brak opinii. Bądź pierwszy!</p>}
              </div>

              {/* dodaj opinię */}
              <div className="rounded-2xl p-5 h-fit" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <h3 className="font-semibold mb-3">Dodaj opinię</h3>
                {authed ? (
                  <form onSubmit={submitReview} className="flex flex-col gap-3">
                    <div className="flex gap-1 text-2xl">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button type="button" key={n} onClick={() => setMyRating(n)}
                                style={{ color: n <= myRating ? "var(--gold)" : "var(--soft,#5E5E75)" }}>★</button>
                      ))}
                    </div>
                    <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} rows={3}
                              placeholder="Twoja opinia (opcjonalnie)" className="rounded-lg px-3 py-2 bg-zinc-900 outline-none text-sm" />
                    <button className="rounded-xl py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Wyślij opinię</button>
                  </form>
                ) : (
                  <p className="text-sm" style={{ color: "var(--mut)" }}>
                    <a href="/login" className="text-amber-400 underline">Zaloguj się</a>, aby dodać opinię.
                  </p>
                )}
                {revMsg && <div className="mt-3 text-sm" style={{ color: "var(--green)" }}>{revMsg}</div>}
              </div>
            </div>
          </section>
        </>)}
      </main>
    </div>
  );
}
