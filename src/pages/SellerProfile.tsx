// Publiczny profil sprzedawcy na portalu: ocena, rozkład gwiazdek, opinie zweryfikowanych kupujących
// (tylko klienci z opłaconym zamówieniem — add_review_simple), odpowiedzi sprzedawcy i jego aktywne oferty.
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/home/SiteChrome";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import MarketFooter from "../components/MarketFooter";

type Review = { id: string; rating: number; comment: string | null; created_at: string; author: string; offer_id: string; offer_title: string | null; seller_reply: string | null; seller_replied_at: string | null };
type Offer = { id: string; title: string; price_gross: number; image_url: string | null; category: string | null; subscription: boolean };
type Profile = { seller_id: string; name: string; seller_type: string; since: string; status: string; rating: number; reviews_count: number; badge: string | null; distribution: Record<string, number>; sales_count: number; reviews: Review[]; offers: Offer[]; offers_count: number };

function zl(n: number) { return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(Number(n || 0)); }
function dateLabel(s: string) { try { return new Date(s).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } }
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(5, Number(value || 0)));
  return <span aria-label={`${v.toFixed(1)} na 5`} style={{ color: "var(--gold)", fontSize: size, letterSpacing: 1 }}>{"★".repeat(Math.round(v))}<span style={{ opacity: .25 }}>{"★".repeat(5 - Math.round(v))}</span></span>;
}
function sellerTypeLabel(t: string) { return t === "business" ? "Partner Handlowy · firma" : t === "sunrise" ? "Sklep Sunrise" : "Sprzedawca · osoba prywatna"; }

export default function SellerProfile() {
  const { id = "" } = useParams();
  const [p, setP] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [filter, setFilter] = useState<number | 0>(0);

  useEffect(() => {
    let alive = true; setState("loading");
    supabase.schema("market").rpc("seller_public_profile", { p_seller: id }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setState("missing"); return; }
      setP(data as Profile); setState("ok");
      document.title = `${(data as Profile).name} — opinie i oferty · Sunrise Market`;
    });
    return () => { alive = false; };
  }, [id]);

  const reviews = useMemo(() => (p?.reviews || []).filter(r => !filter || Number(r.rating) === filter), [p, filter]);
  const total = Number(p?.reviews_count || 0);
  const recommend = useMemo(() => { if (!p || !total) return 0; const d = p.distribution || {}; return Math.round(((Number(d["4"] || 0) + Number(d["5"] || 0)) / total) * 100); }, [p, total]);

  if (state === "loading") return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-5xl rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Wczytuję profil sprzedawcy…</div></main>;
  if (state === "missing" || !p) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-5xl rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-lg font-semibold">Nie znaleziono sprzedawcy</div><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Ten profil nie istnieje albo sprzedawca nie jest już aktywny.</p><Link to="/" className="mt-4 inline-block text-sm font-semibold" style={{ color: "var(--gold)" }}>← Wróć na stronę główną</Link></div></main>;

  const initials = p.name.split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "S";
  return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <nav className="text-xs" style={{ color: "var(--mut)" }}><Link to="/">Strona główna</Link> › <span>Sprzedawcy</span> › <span style={{ color: "var(--ink)" }}>{p.name}</span></nav>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl p-6 sm:p-7" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>{initials}</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{p.name}</h1>
              <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{sellerTypeLabel(p.seller_type)} · na Sunrise od {new Date(p.since).getFullYear()}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.badge && p.badge !== "Nowy" && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(122,184,154,.12)", color: "var(--green)" }}>{p.badge}</span>}
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(245,166,35,.12)", color: "var(--gold)" }}>🛡️ Ochrona Kupujących Sunrise</span>
                {p.seller_type === "business" && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Faktura VAT</span>}
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Ocena" value={total ? `${Number(p.rating).toFixed(1)} / 5` : "Brak ocen"} sub={total ? `${total} ${total === 1 ? "opinia" : total < 5 ? "opinie" : "opinii"}` : "Nowy sprzedawca"} />
            <Stat label="Poleca" value={total ? `${recommend}%` : "—"} sub="oceny 4–5 ★" />
            <Stat label="Sprzedaże" value={String(p.sales_count)} sub={`${p.offers_count} aktywnych ofert`} />
          </div>
          <p className="mt-5 text-xs leading-5" style={{ color: "var(--mut)" }}>Publikujemy wyłącznie opinie klientów, którzy kupili u tego sprzedawcy przez Sunrise Market i opłacili zamówienie. Sprzedawca może publicznie odpowiedzieć na każdą opinię, ale nie może jej edytować ani usunąć. Każda transakcja jest objęta <a href="/legal/ochrona-kupujacego.html" style={{ color: "var(--gold)" }}>Ochroną Kupujących</a>.</p>
        </div>

        <div className="rounded-3xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="flex items-baseline justify-between"><div className="font-semibold">Rozkład ocen</div>{filter > 0 && <button type="button" onClick={() => setFilter(0)} className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Pokaż wszystkie</button>}</div>
          <div className="mt-4 space-y-2">
            {[5, 4, 3, 2, 1].map(star => { const n = Number(p.distribution?.[String(star)] || 0); const pct = total ? Math.round((n / total) * 100) : 0; return <button key={star} type="button" onClick={() => setFilter(filter === star ? 0 : star)} className="flex w-full items-center gap-3 text-left text-sm" style={{ opacity: filter && filter !== star ? .45 : 1 }}>
              <span className="w-8 shrink-0" style={{ color: "var(--gold)" }}>{star} ★</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--header)" }}><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#E8891A,#F5A623)" }} /></span>
              <span className="w-10 shrink-0 text-right text-xs" style={{ color: "var(--mut)" }}>{n}</span>
            </button>; })}
          </div>
          {!total && <p className="mt-4 text-xs leading-5" style={{ color: "var(--mut)" }}>Ten sprzedawca nie ma jeszcze opinii. Pierwsza pojawi się po doręczeniu zamówienia, gdy klient oceni zakup.</p>}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <h2 className="text-xl font-semibold">Opinie kupujących{filter ? ` · ${filter} ★` : ""}</h2>
      {reviews.length === 0 ? <div className="mt-3 rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>{filter ? "Brak opinii z taką oceną." : "Brak opinii — jeszcze nikt nie ocenił zakupu u tego sprzedawcy."}</div>
      : <div className="mt-3 grid gap-3 md:grid-cols-2">{reviews.map(r => <article key={r.id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="flex items-start justify-between gap-3"><div><Stars value={r.rating} /><div className="mt-1 text-sm font-semibold">{r.author}</div></div><div className="text-right text-xs" style={{ color: "var(--mut)" }}>{dateLabel(r.created_at)}<div className="mt-0.5" style={{ color: "var(--green)" }}>✓ Zweryfikowany zakup</div></div></div>
          {r.comment && <p className="mt-3 text-sm leading-6">{r.comment}</p>}
          {r.offer_title && <Link to={`/produkt/${r.offer_id}`} className="mt-3 inline-block text-xs" style={{ color: "var(--mut)" }}>Dotyczy: <span style={{ color: "var(--gold)" }}>{r.offer_title}</span></Link>}
          {r.seller_reply && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Odpowiedź sprzedawcy{r.seller_replied_at ? ` · ${dateLabel(r.seller_replied_at)}` : ""}</div><p className="mt-1 leading-6" style={{ color: "var(--mut)" }}>{r.seller_reply}</p></div>}
        </article>)}</div>}
    </section>

    {p.offers.length > 0 && <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6">
      <div className="flex items-baseline justify-between"><h2 className="text-xl font-semibold">Oferty sprzedawcy</h2><span className="text-xs" style={{ color: "var(--mut)" }}>{p.offers_count} aktywnych</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{p.offers.map(o => <Link key={o.id} to={`/produkt/${o.id}`} className="overflow-hidden rounded-2xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="aspect-[4/3] w-full" style={{ background: "var(--header)" }}>{o.image_url ? <img src={o.image_url} alt={o.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">🛍️</div>}</div>
        <div className="p-3"><div className="line-clamp-2 text-sm font-semibold leading-5">{o.title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{o.category || ""}</div><div className="mt-2 font-semibold" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}{o.subscription ? <span className="text-xs font-normal" style={{ color: "var(--mut)" }}> / mies.</span> : null}</div></div>
      </Link>)}</div>
    </section>}
    <MarketFooter />
  </main>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-lg font-semibold sm:text-xl">{value}</div><div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{sub}</div></div>;
}
