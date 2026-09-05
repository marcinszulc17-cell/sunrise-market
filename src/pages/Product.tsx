import { useEffect, useState } from "react";
import ShareOfferButton from "../components/ShareOfferButton";
import MessageSellerButton from "../components/MessageSellerButton";
import ShowPhoneButton from "../components/ShowPhoneButton";
import LocationMap from "../components/LocationMap";
import { useParams } from "react-router-dom";
import { addReview, getOffer, offerImages, offerReviews, similarOffers, trackView } from "../lib/api";
import { addToCart, cleanTitle, isTestProduct } from "../lib/cart";
import { zl } from "../lib/money";
import { subscriptionInfo } from "../lib/subscription";
import { pushRecent } from "../lib/recent";
import { supabase } from "../lib/supabase";
import { useProductJsonLd, useSeo } from "../lib/seo";
import { SiteHeader, Breadcrumbs, SectionTitle } from "../components/home/SiteChrome";
import { Ico, GOLD_GRAD, CARD } from "../components/home/HomeShared";

type PurchaseMode = "purchase" | "appointment" | "daily";
type Offer = {
  offer_id: string; title: string; description: string | null; price_gross: number;
  stock: number; status: string; category: string; category_slug: string;
  seller: string; seller_id: string; avg_rating: number; review_count: number; image_url: string | null;
  attributes?: {
    colors?: string[]; sizes?: string[]; specs?: Record<string, string>;
    features?: string[]; packing?: string[]; video?: string | null;
    purchase_mode?: PurchaseMode;
    promo?: { percent?: number; old_price?: number; until?: string } | null;
  } | null;
};
type Review = { rating: number; comment: string | null; author: string; created_at: string };

function stars(n: number) { const f = Math.round(n); return "★".repeat(f) + "☆".repeat(5 - f); }
function visual(t: string): { emoji: string; from: string; to: string } {
  const s = t.toLowerCase();
  const O = "#E8891A", G = "#F5A623", GR = "#7AB89A", CY = "#38E0F0", VI = "#8FB0EE", PU = "#3A6FD9", PK = "#F25CB0";
  if (s.includes("panel") || s.includes("fotowolt")) return { emoji: "🔆", from: O, to: G };
  if (s.includes("magazyn") || s.includes("inwerter")) return { emoji: "🔋", from: GR, to: CY };
  if (s.includes("pompa") || s.includes("kolektor")) return { emoji: "♨️", from: O, to: PK };
  if (s.includes("smartfon")) return { emoji: "📱", from: CY, to: VI };
  if (s.includes("słuchaw") || s.includes("audio")) return { emoji: "🎧", from: VI, to: PU };
  if (s.includes("laptop") || s.includes("komputer")) return { emoji: "💻", from: CY, to: PU };
  if (s.includes("kamera") || s.includes("foto")) return { emoji: "📷", from: VI, to: CY };
  if (s.includes("ekspres") || s.includes("odkurz") || s.includes("agd")) return { emoji: "🧺", from: CY, to: GR };
  if (s.includes("kurtk") || s.includes("sneaker") || s.includes("moda")) return { emoji: "👟", from: PK, to: VI };
  if (s.includes("rower") || s.includes("namiot") || s.includes("sport")) return { emoji: "🚴", from: GR, to: CY };
  if (s.includes("karma") || s.includes("zwierz")) return { emoji: "🐾", from: G, to: GR };
  return { emoji: "🌅", from: O, to: "#A97B42" };
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
  const [imgs, setImgs] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [similar, setSimilar] = useState<any[]>([]);

  const isTest = isTestProduct(o?.title);
  const shownTitle = cleanTitle(o?.title);
  const A = o?.attributes || {};
  const purchaseMode: PurchaseMode = A.purchase_mode === "appointment" || A.purchase_mode === "daily" ? A.purchase_mode : "purchase";
  const isBooking = purchaseMode !== "purchase";
  const sub = subscriptionInfo(o?.attributes as Record<string, unknown> | undefined, o?.title);
  const colors = A.colors ?? [];
  const sizes = A.sizes ?? [];
  const specs = A.specs ?? {};
  const features = A.features ?? [];
  const packing = A.packing ?? [];
  const needColor = !isBooking && colors.length > 0 && !color;
  const needSize = !isBooking && sizes.length > 0 && !size;
  const variantLabel = [color && `Kolor: ${color}`, size && `Rozmiar: ${size}`].filter(Boolean).join(", ");

  useSeo(o ? shownTitle : "Produkt", o ? `${shownTitle} — ${zl(o.price_gross)}. ${(o.description ?? "").slice(0, 140)}` : "Produkt w Sunrise Market.", id ? `/produkt/${id}` : "");
  useProductJsonLd(o ? { id: o.offer_id, name: o.title, price: o.price_gross, image: o.image_url, rating: o.avg_rating, reviews: o.review_count } : null);

  async function loadReviews(oid: string) { setReviews((await offerReviews(oid)) as Review[]); }
  useEffect(() => {
    if (!id) return;
    getOffer(id).then((d) => {
      const oo = d as Offer;
      setO(oo);
      pushRecent({ offer_id: oo.offer_id, title: oo.title, price_gross: oo.price_gross, image_url: oo.image_url });
    }).catch((e) => setErr(String((e as Error).message))).finally(() => setLoading(false));
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
      setO(await getOffer(id) as Offer);
      setRevMsg("Dziękujemy za opinię!");
    } catch (e) { setRevMsg((e as Error).message); }
  }

  function openBooking() { window.dispatchEvent(new Event("sunrise-open-booking")); }

  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader active={o?.category_slug?.startsWith("oze") ? "energy" : o?.category_slug?.startsWith("uslugi") ? "services" : "shop"} />

    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 xl:px-10">
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
      {err && <p className="text-rose-400">Błąd: {err}</p>}
      {!loading && !o && <p style={{ color: "var(--mut)" }}>Nie znaleziono produktu. <a href="/" className="text-amber-400 underline">Wróć do sklepu</a>.</p>}

      {o && <>
        <Breadcrumbs back="/sklep" items={[{ label: "Strona główna", to: "/" }, { label: o.category || "Zakupy", to: `/szukaj?kat=${encodeURIComponent(o.category_slug || "")}` }, { label: shownTitle }]} />
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl text-8xl" style={{ background: `radial-gradient(220px 160px at 50% 35%, ${visual(o.title + o.category).from}33, transparent 70%), var(--glass)`, border: "1px solid var(--line)" }}>
              {(imgs[active] || o.image_url) ? <img src={imgs[active] || o.image_url!} alt={o.title} className="h-full w-full object-cover"/> : visual(o.title + o.category).emoji}
              {imgs.length > 1 && <><button type="button" aria-label="Poprzednie zdjęcie" onClick={() => setActive((active - 1 + imgs.length) % imgs.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-2xl backdrop-blur" style={{ background: "rgba(11,11,13,.7)", color: "#fff" }}>‹</button><button type="button" aria-label="Następne zdjęcie" onClick={() => setActive((active + 1) % imgs.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-2xl backdrop-blur" style={{ background: "rgba(11,11,13,.7)", color: "#fff" }}>›</button><div className="absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-xs backdrop-blur" style={{ background: "rgba(11,11,13,.7)", color: "#fff" }}>{active + 1} / {imgs.length}</div></>}
            </div>
            {imgs.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{imgs.map((u, i) => <button key={u} onClick={() => setActive(i)} aria-label={`Zdjęcie ${i + 1}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: active === i ? "2px solid var(--gold)" : "1px solid var(--line)" }}><img src={u} alt="" className="h-full w-full object-cover"/></button>)}</div>}
            {A.video && <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}><video src={A.video} controls playsInline preload="metadata" poster={imgs[0] || o.image_url || undefined} className="h-auto w-full bg-black" style={{ maxHeight: 360 }}/><div className="px-3 py-2 text-xs" style={{ color: "var(--mut)" }}>🎬 Wideo produktu</div></div>}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">{A.promo?.percent && <span className="rounded-lg px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(245,166,35,.14)", border: "1px solid rgba(245,166,35,.4)", color: "var(--gold)" }}>PROMOCJA −{A.promo.percent}%</span>}<div className="ml-auto flex items-center gap-1"><ShareOfferButton offerId={o.offer_id} title={o.title} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm" style={{ color: "var(--mut)" }} /></div></div>
            <div className="flex flex-wrap items-center gap-3">{A.promo?.old_price && <div className="text-xl font-semibold line-through" style={{ color: "var(--mut)" }}>{zl(A.promo.old_price)}</div>}<div className="text-4xl font-extrabold" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}{purchaseMode === "daily" ? <span className="text-base font-medium" style={{ color: "var(--mut)" }}> / dobę</span> : purchaseMode === "appointment" ? <span className="text-base font-medium" style={{ color: "var(--mut)" }}> / termin</span> : sub ? <span className="text-base font-medium" style={{ color: "var(--mut)" }}> {sub.priceSuffix}</span> : null}</div></div>
            <h1 className="text-3xl font-bold leading-tight">{shownTitle}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--mut)" }}><a href={`/szukaj?kat=${encodeURIComponent(o.category_slug || "")}`} className="flex items-center gap-1.5 navlink"><Ico name="bag" size={16} />{o.category}</a><span className="flex items-center gap-1.5"><Ico name="user" size={16} />{o.seller}</span>{o.review_count > 0 && <span style={{ color: "var(--gold)" }}>{stars(o.avg_rating)} <span style={{ color: "var(--mut)" }}>{o.avg_rating.toFixed(1)} ({o.review_count})</span></span>}</div>
            {isTest && <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(242,92,176,.12)", color: "#F8A8D2", border: "1px solid rgba(242,92,176,.3)" }}><b>Produkt testowy.</b> Pozycja z katalogu w przygotowaniu.</div>}
            {isBooking && <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.2)" }}><b>{purchaseMode === "daily" ? "🗓️ Wynajem" : "📅 Rezerwacja terminu"}</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{purchaseMode === "daily" ? "Wybierz daty od–do. System sprawdzi dostępność i pokaże czynsz za cały okres oraz ewentualną kaucję." : "Wybierz dostępny dzień i godzinę, a następnie opłać rezerwację."}</div></div>}

            <div><span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>+{Math.round(o.price_gross * 0.03).toLocaleString("pl-PL")} pkt cashback{sub ? " / mies." : ""}</span></div>
            {sub && <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(56,224,240,.08)", border: "1px solid rgba(56,224,240,.2)" }}><b>🔁 {sub.badge} — płatna z góry</b><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{sub.note}</div></div>}
            <div className="text-sm" style={{ color: o.stock > 0 ? "var(--green)" : "#F25CB0" }}>{o.stock > 0 ? (isBooking ? `Dostępne zasoby: ${o.stock}` : (sub || o.stock >= 9999) ? "Dostępne" : `Dostępne: ${o.stock} szt.`) : "Chwilowo niedostępne"}</div>

            {!isBooking ? (() => { const fp=(o as any).fulfillment_provider; const eta=(o as any).delivery_eta||(o as any).attributes?.delivery_eta; const txt=fp==="teemdrop"?`🚚 Dostawa kurierem: ${eta||"15–25 dni roboczych"} (wysyłka z magazynu partnera)`:fp==="mysunrise"?"🔧 Montaż i dostawa po ustaleniu terminu z instalatorem Sunrise":"🚚 Wysyłka: Paczkomat InPost lub kurier · darmowa dostawa od 149 zł"; return <div className="text-xs" style={{ color: "var(--mut)" }}>{txt}</div>; })() : <div className="text-xs" style={{ color: "var(--mut)" }}>✓ Dostępność sprawdzana na żywo w kalendarzu · płatność przy rezerwacji</div>}

            <div className="flex flex-wrap gap-2 pt-1">{(isBooking ? ["Ochrona płatności", "Płatna rezerwacja", "Płatność Sunrise Pay", "Cashback na portfel"] : sub ? ["Płatność kartą", "Odnawiana co miesiąc", "Cashback co miesiąc", "Rezygnacja w każdej chwili"] : ["Ochrona kupującego", "Zwrot 14 dni", "Płatność Sunrise Pay", "Cashback na portfel"]).map(t => <span key={t} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--mut)" }}><span className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold" style={{ background: "rgba(245,166,35,.16)", color: "var(--gold)" }}>✓</span>{t}</span>)}</div>

            {!isBooking && colors.length > 0 && <div><div className="mb-2 text-sm" style={{ color: "var(--mut)" }}>Kolor{color ? `: ${color}` : ""}</div><div className="flex flex-wrap gap-2">{colors.map(c => <button key={c} onClick={() => setColor(c)} className="rounded-xl px-3 py-1.5 text-sm" style={color === c ? { background: "linear-gradient(135deg,#E8891A,#A97B42)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)" }}>{c}</button>)}</div></div>}
            {!isBooking && sizes.length > 0 && <div><div className="mb-2 text-sm" style={{ color: "var(--mut)" }}>Rozmiar{size ? `: ${size}` : ""}</div><div className="flex flex-wrap gap-2">{sizes.map(s => <button key={s} onClick={() => setSize(s)} className="min-w-10 rounded-xl px-3 py-1.5 text-sm" style={size === s ? { background: "linear-gradient(135deg,#E8891A,#A97B42)", color: "#000", fontWeight: 600 } : { background: "var(--glass)", border: "1px solid var(--line)" }}>{s}</button>)}</div></div>}
            {o.description && <p className="text-sm leading-relaxed" style={{ color: "var(--mut)" }}>{o.description.split(/\n\s*\n/)[0].slice(0,220)}{o.description.length > 220 ? "…" : ""}</p>}

            {(needColor || needSize) && <div className="text-xs" style={{ color: "var(--gold)" }}>Wybierz {needColor ? "kolor" : ""}{needColor && needSize ? " i " : ""}{needSize ? "rozmiar" : ""}, aby dodać do koszyka.</div>}
            {isBooking ? <button type="button" onClick={openBooking} disabled={isTest || o.stock <= 0} className="flex h-12 w-full items-center justify-center rounded-xl text-center font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: GOLD_GRAD, color: "#101012", boxShadow: "0 8px 24px rgba(232,137,26,.3)" }}>{purchaseMode === "daily" ? "🗓️ Wybierz daty i zarezerwuj" : "📅 Wybierz termin i zarezerwuj"}</button> : <div className="mt-2 grid gap-3 sm:grid-cols-[1.2fr_1fr]"><button disabled={isTest || needColor || needSize || o.stock <= 0} title={isTest ? "Produkt testowy — chwilowo niedostępny do zakupu" : undefined} onClick={() => { if (isTest) return; addToCart({ offer_id: o.offer_id, title: o.title, price: o.price_gross, variant: variantLabel || undefined, billing: sub?.interval }); window.location.href = "/koszyk"; }} className="flex h-12 items-center justify-center gap-2 rounded-xl text-center font-bold disabled:cursor-not-allowed disabled:opacity-50" style={isTest ? { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" } : { background: GOLD_GRAD, color: "#101012", boxShadow: "0 8px 24px rgba(232,137,26,.3)" }}><Ico name="cart" size={18} strokeWidth={2.2} />{isTest ? "Niedostępny do zakupu" : "Kup teraz"}</button><MessageSellerButton offerId={o.offer_id} title={shownTitle} /></div>}
            {isBooking && <MessageSellerButton offerId={o.offer_id} title={shownTitle} />}
            <ShowPhoneButton offerId={o.offer_id} />

            <div className="mt-2 rounded-2xl p-4 text-xs" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>{purchaseMode === "daily" ? <>Wybierasz dostępne daty od–do, widzisz pełny czynsz i ewentualną kaucję, a następnie płacisz i rezerwujesz. Cashback naliczany jest od czynszu, bez kaucji.</> : purchaseMode === "appointment" ? <>Wybierasz dostępny termin, a następnie potwierdzasz i opłacasz rezerwację. Cashback naliczany jest od opłaconej usługi.</> : sub ? <>Subskrypcję opłacasz <b style={{ color: "var(--gold)" }}>kartą</b> — pierwsza płatność od razu, kolejne co miesiąc automatycznie; za każdą wraca cashback 3% na portfel Sunrise Pay. Rezygnacja w każdej chwili w zakładce Zamówienia → Moje subskrypcje.</> : <>Płatność przez <b style={{ color: "var(--gold)" }}>Sunrise Pay</b> albo kartą / BLIK / P24. Cashback 3% wraca na portfel po każdym zakupie, niezależnie od metody płatności. <b style={{ color: "var(--ink)" }}>Ochrona Kupujących:</b> sprzedający dostaje pieniądze dopiero, gdy potwierdzisz odbiór — inaczej wracają do Ciebie.</>}</div>
          </div>
        </div>

        {o.description && <section className="mt-10 rounded-2xl p-5 sm:p-6" style={CARD}><SectionTitle className="mb-4">Opis {isBooking ? "oferty" : "produktu"}</SectionTitle><div className="flex max-w-3xl flex-col gap-4">{o.description.split(/\n\s*\n/).filter(Boolean).map((par,i)=><p key={i} className="leading-relaxed" style={{ color: "var(--ink)" }}>{par.trim()}</p>)}</div></section>}

        {(features.length > 0 || Object.keys(specs).length > 0 || packing.length > 0) && <section className="mt-6 grid gap-6 md:grid-cols-2">{features.length > 0 && <div className="rounded-2xl p-5 md:col-span-2" style={CARD}><SectionTitle className="mb-4">Najważniejsze cechy</SectionTitle><ul className="flex flex-col gap-2">{features.map((f,i)=><li key={i} className="flex gap-2"><span style={{ color: "var(--green)" }}>✓</span><span>{f}</span></li>)}</ul></div>}{Object.keys(specs).length > 0 && <div className="rounded-2xl p-5" style={CARD}><SectionTitle className="mb-4">Specyfikacja</SectionTitle><div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>{Object.entries(specs).map(([k,v],i)=><div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm" style={{ background: i%2 ? "transparent" : "var(--glass)", borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--mut)" }}>{k}</span><span className="text-right font-medium">{String(v)}</span></div>)}</div></div>}{packing.length > 0 && <div className="rounded-2xl p-5" style={CARD}><SectionTitle className="mb-4">Zawartość zestawu</SectionTitle><ul className="flex flex-col gap-2">{packing.map((p,i)=><li key={i} className="flex gap-2 text-sm"><span style={{ color: "var(--gold)" }}>•</span><span>{p}</span></li>)}</ul></div>}</section>}

        <LocationMap location={typeof (o.attributes as any)?.location === "string" ? (o.attributes as any).location : null} className="mt-6 max-w-xl" />
        {similar.length > 0 && <section className="mt-10"><SectionTitle className="mb-4" action={<a href={`/szukaj?kat=${encodeURIComponent(o.category_slug || "")}`} className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold" style={CARD}>Zobacz wszystkie ›</a>}>Podobne ogłoszenia</SectionTitle><div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>{similar.map((s:any)=><a key={s.offer_id} href={`/produkt/${s.offer_id}`} className="group overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={CARD}><div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--header)" }}>{s.image_url ? <img src={s.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy"/> : <div className="grid h-full place-items-center text-3xl">🌅</div>}</div><div className="p-3"><div className="font-bold" style={{ color: "var(--gold)" }}>{zl(s.price_gross)}</div><div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{String(s.title)}</div>{s.category && <div className="mt-1 text-[11px]" style={{ color: "var(--mut)" }}>{s.category}</div>}</div></a>)}</div></section>}

        <section id="opinia" className="mt-10 scroll-mt-24"><SectionTitle className="mb-4">Opinie {o.review_count > 0 && <span style={{ color: "var(--mut)" }}>({o.review_count})</span>}</SectionTitle><div className="grid gap-8 md:grid-cols-3"><div className="flex flex-col gap-3 md:col-span-2">{reviews.map((r,i)=><div key={i} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="flex items-center justify-between"><span style={{ color: "var(--gold)" }}>{stars(r.rating)}</span><span className="text-xs" style={{ color: "var(--mut)" }}>{r.author} · {new Date(r.created_at).toLocaleDateString("pl-PL")}</span></div>{r.comment && <p className="mt-2 text-sm">{r.comment}</p>}</div>)}{reviews.length===0&&<p style={{ color: "var(--mut)" }}>Brak opinii. Publikujemy wyłącznie oceny klientów, którzy kupili ten produkt — jeśli to Ty, oceń zakup obok.</p>}</div><div className="h-fit rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><h3 className="mb-3 font-semibold">Dodaj opinię</h3>{authed ? <form onSubmit={submitReview} className="flex flex-col gap-3"><div className="flex gap-1 text-2xl">{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setMyRating(n)} style={{ color:n<=myRating?"var(--gold)":"var(--soft,#5E5E75)" }}>★</button>)}</div><textarea value={myComment} onChange={e=>setMyComment(e.target.value)} rows={3} placeholder="Twoja opinia (opcjonalnie)" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm outline-none"/><button className="rounded-xl py-2 font-semibold text-black" style={{ background:"linear-gradient(135deg,#E8891A,#F5A623)" }}>Wyślij opinię</button></form> : <p className="text-sm" style={{ color:"var(--mut)" }}><a href="/login" className="text-amber-400 underline">Zaloguj się</a>, aby dodać opinię.</p>}{revMsg&&<div className="mt-3 text-sm" style={{ color:"var(--green)" }}>{revMsg}</div>}</div></div></section>
      </>}
    </main>
  </div>;
}
