// Strona „temat + miasto" w aplikacji: /oferty/<temat>/<miasto>.
//
// Tę samą treść serwer wystawia robotom w api/temat.ts (prerender). Tutaj jest wersja,
// którą widzi człowiek klikający po serwisie — z kartami, zdjęciami i linkami do sąsiednich
// tematów i miast. Tematy biorą się z kategorii Marketu, więc nic tu nie jest wpisane na stałe.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";
import { offerPath } from "../lib/offerId";
import { SiteHeader, Breadcrumbs } from "../components/home/SiteChrome";
import { HomeFooter, GOLD_GRAD, CARD } from "../components/home/HomeShared";

type Naglowek = { temat: string; nazwa: string; opis: string; miasto: string; miasto_nazwa: string; region: string; ofert: number };
type Oferta = { offer_id: string; title: string; price_gross: number; category: string; category_slug: string; image_url: string | null; location: string | null };
type Sasiad = { rodzaj: "temat" | "miasto"; slug: string; nazwa: string; ofert: number };

const ileOfert = (n: number) => `${n} ${n === 1 ? "oferta" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "oferty" : "ofert"}`;

export default function TematLokalny() {
  const { temat = "", miasto = "" } = useParams();
  const [head, setHead] = useState<Naglowek | null | undefined>(undefined);
  const [oferty, setOferty] = useState<Oferta[] | null>(null);
  const [sasiedzi, setSasiedzi] = useState<Sasiad[]>([]);

  useEffect(() => {
    let alive = true;
    setHead(undefined); setOferty(null); setSasiedzi([]);
    supabase.rpc("temat_lokalny", { p_temat: temat, p_miasto: miasto }).then(({ data }) => {
      if (!alive) return;
      setHead(((data as Naglowek[]) ?? [])[0] ?? null);
    });
    supabase.rpc("oferty_tematyczne", { p_temat: temat, p_miasto: miasto, p_limit: 30 })
      .then(({ data }) => { if (alive) setOferty((data as Oferta[]) ?? []); });
    supabase.rpc("temat_sasiedzi", { p_temat: temat, p_miasto: miasto })
      .then(({ data }) => { if (alive) setSasiedzi((data as Sasiad[]) ?? []); });
    return () => { alive = false; };
  }, [temat, miasto]);

  const nazwaMiasta = head?.miasto_nazwa ?? "";
  useSeo(
    head ? `${head.nazwa} ${nazwaMiasta} — oferty z okolicy | Sunrise Market` : "Oferty w Twojej okolicy | Sunrise Market",
    head ? `${head.nazwa} w ${nazwaMiasta}: ${ileOfert(head.ofert)} od sprzedawców, którzy obsługują ${nazwaMiasta} i okolice. ${head.opis}`.slice(0, 300) : "",
    `/oferty/${temat}/${miasto}`,
  );

  const tematyTu = sasiedzi.filter((s) => s.rodzaj === "temat");
  const miastaTemat = sasiedzi.filter((s) => s.rodzaj === "miasto");

  if (head === null) return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader back />
    <div className="mx-auto max-w-[1100px] px-4 py-10">
      <h1 className="text-2xl font-bold">Nie mamy tu jeszcze ofert</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>
        W tej okolicy nikt jeszcze nic w tej kategorii nie wystawił. Możesz być pierwszy —
        dodanie ogłoszenia jest bezpłatne przez pierwszy rok.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/sprzedawca/wystaw" className="rounded-xl px-4 py-2.5 text-sm font-bold text-black" style={{ background: GOLD_GRAD }}>Dodaj ogłoszenie</Link>
        <Link to={`/miasto/${miasto}`} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={CARD}>Zobacz, co mamy w tej okolicy</Link>
      </div>
    </div>
    <HomeFooter />
  </main>;

  return <main className="min-h-screen pb-24 sm:pb-8" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader back />
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <Breadcrumbs back="/" items={[
        { label: "Strona główna", to: "/" },
        ...(head ? [{ label: head.miasto_nazwa, to: `/miasto/${head.miasto}` }, { label: head.nazwa }] : [{ label: "Oferty" }]),
      ]} />

      {head && <>
        <div className="mt-5 text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>
          SUNRISE MARKET · {head.region.toUpperCase()}
        </div>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{head.nazwa} {head.miasto_nazwa}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7" style={{ color: "var(--mut)" }}>
          {ileOfert(head.ofert)} od sprzedawców, którzy obsługują {head.miasto_nazwa} i okolice. {head.opis}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/sprzedawca/wystaw" className="rounded-xl px-4 py-2.5 text-sm font-bold text-black" style={{ background: GOLD_GRAD }}>+ Dodaj swoją ofertę</Link>
          <Link to={`/miasto/${head.miasto}`} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={CARD}>Wszystko w {head.miasto_nazwa}</Link>
        </div>
      </>}

      <div className="mt-7">
        {oferty === null && <div className="text-sm" style={{ color: "var(--mut)" }}>Ładowanie…</div>}
        {oferty !== null && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {oferty.map((o) => <Link key={o.offer_id} to={offerPath(o.offer_id, o.title)} className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5" style={CARD}>
            {o.image_url
              ? <img src={o.image_url} alt="" loading="lazy" className="h-40 w-full object-cover" />
              : <div className="grid h-40 w-full place-items-center text-4xl" style={{ background: "rgba(232,137,26,.08)" }}>🛍️</div>}
            <div className="p-4">
              <div className="text-xs" style={{ color: "var(--mut)" }}>{o.category}</div>
              <div className="mt-1 line-clamp-2 font-semibold leading-snug">{o.title}</div>
              {Number(o.price_gross) > 0 && <div className="mt-2 font-bold" style={{ color: "var(--gold)" }}>{zl(Number(o.price_gross))}</div>}
              <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>
                📍 {o.location || `obsługuje ${nazwaMiasta}`}
              </div>
            </div>
          </Link>)}
        </div>}
      </div>

      {tematyTu.length > 0 && <section className="mt-10">
        <h2 className="text-lg font-semibold">Czego jeszcze szukasz w {nazwaMiasta}?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {tematyTu.map((s) => <Link key={s.slug} to={`/oferty/${s.slug}/${miasto}`} className="rounded-xl px-3 py-2 text-sm" style={CARD}>
            {s.nazwa} <span style={{ color: "var(--mut)" }}>({s.ofert})</span>
          </Link>)}
        </div>
      </section>}

      {miastaTemat.length > 0 && <section className="mt-8">
        <h2 className="text-lg font-semibold">{head?.nazwa} w innych miastach</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {miastaTemat.map((s) => <Link key={s.slug} to={`/oferty/${temat}/${s.slug}`} className="rounded-xl px-3 py-2 text-sm" style={CARD}>
            {s.nazwa} <span style={{ color: "var(--mut)" }}>({s.ofert})</span>
          </Link>)}
        </div>
      </section>}
    </div>
    <HomeFooter />
  </main>;
}
