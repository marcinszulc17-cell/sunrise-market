import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchOffersWithAttributes } from "../lib/api";
import { SiteHeader, Breadcrumbs } from "../components/home/SiteChrome";
import { useSeo } from "../lib/seo";
import { offerPath } from "../lib/offerId";

// Rynek pracy w Sunrise Market ma dwie strony. „Oferty pracy” to ogloszenia firm,
// „Szukam pracy” to ogloszenia kandydatow — tego drugiego nie ma na typowych portalach.
const SIDES = {
  oferty: { slug: "ogloszenia-lokalne-praca", label: "Oferty pracy", icon: "💼", empty: "Nie ma jeszcze ofert pracy w tej okolicy.", cta: "Dodaj ofertę pracy" },
  szukam: { slug: "ogloszenia-lokalne-szukam-pracy", label: "Szukam pracy", icon: "🙋", empty: "Nikt jeszcze nie dodał ogłoszenia „szukam pracy”.", cta: "Dodaj ogłoszenie „Szukam pracy”" },
} as const;
type SideKey = keyof typeof SIDES;

type Row = { offer_id: string; title: string; category: string; image_url: string | null; attributes: any; created_at: string };

const CARD: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)" };
const GOLD_GRAD = "linear-gradient(135deg,#E8891A,#F5A623)";

export default function Praca() {
  const [sp, setSp] = useSearchParams();
  const side: SideKey = sp.get("strona") === "szukam" ? "szukam" : "oferty";
  const cfg = SIDES[side];
  const [q, setQ] = useState(sp.get("q") || "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null); setErr(null);
    searchOffersWithAttributes(q.trim() || null, cfg.slug, { sort: "newest", limit: 100 })
      .then(d => { if (!cancelled) setRows(d as Row[]); })
      .catch(e => { if (!cancelled) { setErr((e as Error).message); setRows([]); } });
    return () => { cancelled = true; };
  }, [cfg.slug, sp.get("q")]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(sp);
    if (q.trim()) next.set("q", q.trim()); else next.delete("q");
    setSp(next, { replace: true });
  }
  function pick(next: SideKey) {
    const p = new URLSearchParams(sp); p.set("strona", next); setSp(p, { replace: true });
  }

  const addUrl = `/sprzedawca/wystaw?typ=lokalne&kategoria=${cfg.slug}`;
  const count = rows?.length ?? 0;
  const heading = useMemo(() => side === "oferty" ? "Praca w Twojej okolicy" : "Ludzie, którzy szukają pracy", [side]);

  // Strona miała tytuł strony głównej, więc w wynikach wyglądała jak kopia Sunrise Market.
  // Rynek pracy jest pełnoprawnym działem i musi mieć własny wpis w Google.
  useSeo(
    side === "oferty" ? "Oferty pracy w okolicy — Sunrise Market" : "Szukam pracy — ogłoszenia kandydatów | Sunrise Market",
    side === "oferty"
      ? "Bezpłatne ogłoszenia o pracę od lokalnych firm. Stanowisko, wynagrodzenie brutto lub netto i forma zatrudnienia widoczne od razu — aplikujesz bezpośrednio do pracodawcy."
      : "Ogłoszenia osób szukających pracy. Zobacz, kto jest dostępny w Twojej okolicy, i odezwij się bezpośrednio — dodanie ogłoszenia jest bezpłatne.",
    side === "oferty" ? "/praca" : "/praca?strona=szukam",
  );

  // Ta strona długo nie miała nagłówka serwisu: kto na nią wszedł, zostawał bez logo,
  // bez koszyka i bez drogi powrotnej — jedynym wyjściem był przycisk „wstecz" przeglądarki.
  return <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader back active="jobs" />
    <main className="px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <div className="mb-5"><Breadcrumbs back="/" items={[{ label: "Strona główna", to: "/" }, { label: "Ogłoszenia lokalne", to: "/szukaj?kat=ogloszenia-lokalne" }, { label: cfg.label }]} /></div>
      <div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
      <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{heading}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 sm:text-base" style={{ color: "var(--mut)" }}>
        Ogłoszenia o pracę są bezpłatne w obie strony. Firma dodaje ofertę, a kandydat może dodać własne ogłoszenie „szukam pracy” — wtedy to pracodawcy odzywają się do niego.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(SIDES) as SideKey[]).map(k => (
          <button key={k} type="button" onClick={() => pick(k)} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={side === k ? { background: GOLD_GRAD, color: "#101012" } : CARD}>
            {SIDES[k].icon} {SIDES[k].label}
          </button>
        ))}
        <Link to={addUrl} className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold" style={CARD}>+ {cfg.cta}</Link>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={side === "oferty" ? "Stanowisko, branża lub miejscowość" : "Zawód, umiejętność lub miejscowość"} className="min-w-0 flex-1 rounded-xl px-3 py-2.5 outline-none" style={CARD} />
        <button className="rounded-xl px-5 py-2.5 text-sm font-bold text-black" style={{ background: GOLD_GRAD }}>Szukaj</button>
      </form>

      {err && <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(232,137,26,.12)", color: "var(--gold)" }}>{err}</div>}

      <div className="mt-6">
        {rows === null && <div className="text-sm" style={{ color: "var(--mut)" }}>Ładowanie…</div>}
        {rows !== null && count === 0 && <div className="rounded-3xl p-6 text-sm" style={{ ...CARD, color: "var(--mut)" }}>
          {cfg.empty} <Link to={addUrl} className="underline" style={{ color: "var(--gold)" }}>Dodaj pierwsze — bezpłatnie.</Link>
        </div>}
        {rows !== null && count > 0 && <>
          <div className="mb-3 text-sm" style={{ color: "var(--mut)" }}>{count} {count === 1 ? "ogłoszenie" : count < 5 ? "ogłoszenia" : "ogłoszeń"}</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(r => {
              const loc = r.attributes?.location ? String(r.attributes.location) : null;
              return <Link key={r.offer_id} to={offerPath(r.offer_id, r.title)} className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5" style={CARD}>
                {r.image_url
                  ? <img src={r.image_url} alt="" className="h-40 w-full object-cover" />
                  : <div className="grid h-40 w-full place-items-center text-5xl" style={{ background: "rgba(232,137,26,.08)" }}>{cfg.icon}</div>}
                <div className="p-4">
                  <div className="text-xs" style={{ color: "var(--mut)" }}>{r.category}</div>
                  <div className="mt-1 line-clamp-2 font-semibold leading-snug">{r.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: "var(--mut)" }}>
                    {loc && <span>📍 {loc}</span>}
                    <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(122,184,154,.12)" }}>Bezpłatne</span>
                  </div>
                </div>
              </Link>;
            })}
          </div>
        </>}
      </div>

      <div className="mt-8 rounded-3xl p-6" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)" }}>
        <h2 className="text-lg font-semibold">{side === "oferty" ? "Szukasz pracy?" : "Szukasz pracownika?"}</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>
          {side === "oferty"
            ? "Dodaj własne ogłoszenie „szukam pracy”. Opisz, co umiesz i od kiedy możesz zacząć — pracodawcy odezwą się do Ciebie sami."
            : "Przejrzyj ogłoszenia kandydatów i napisz bezpośrednio do osoby, która pasuje. Możesz też dodać własną ofertę pracy."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => pick(side === "oferty" ? "szukam" : "oferty")} className="rounded-xl px-4 py-2.5 text-sm font-bold text-black" style={{ background: GOLD_GRAD }}>
            {side === "oferty" ? "🙋 Zobacz kandydatów" : "💼 Zobacz oferty pracy"}
          </button>
          <Link to={`/sprzedawca/wystaw?typ=lokalne&kategoria=${side === "oferty" ? SIDES.szukam.slug : SIDES.oferty.slug}`} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={CARD}>
            + {side === "oferty" ? SIDES.szukam.cta : SIDES.oferty.cta}
          </Link>
        </div>
      </div>
    </div>
    </main>
  </div>;
}
