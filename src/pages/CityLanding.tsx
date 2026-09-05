// Strony miast (SEO, decyzja właściciela 2026-09-06): /miasto/<slug> — „Sunrise Market w …: ogłoszenia, usługi, nieruchomości, OZE”.
// Sunrise Market jest platformą DLA WSZYSTKICH sprzedawców — strona pokazuje prawdziwe oferty obsługujące miasto
// (RPC city_offers: lokalizacja tekstowa albo zasięg dojazdu), a marki własne Sunrise (OZE, zasięg SERVICE_RADIUS_KM) są jedną
// z sekcji, nie całością. FAQ, linki do pozostałych miast, CTA dla lokalnych sprzedawców. Roboty dostają tę samą treść z api/miasto.ts.
// /miasto bez sluga = lista miast. Stare /oze i /oze/<slug> przekierowują.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";
import { CITIES, BASE_CITY, SERVICE_RADIUS_KM, SERVICE_REGIONS, cityBySlug, inCity } from "../lib/cities";
import { SiteHeader, Breadcrumbs, SectionTitle } from "../components/home/SiteChrome";
import { Ico, IconTile, HomeFooter, GOLD_GRAD, CARD, timeAgo } from "../components/home/HomeShared";

type Row = { offer_id: string; title: string; price_gross: number; category: string; category_slug: string; image_url: string | null; created_at: string; location: string | null };

export function CityLinks({ current, className = "" }: { current?: string; className?: string }) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{CITIES.map((c) => <Link key={c.slug} to={`/miasto/${c.slug}`} aria-current={c.slug === current ? "page" : undefined} className="flex h-10 items-center rounded-xl px-3 text-sm font-medium transition hover:-translate-y-0.5" style={c.slug === current ? { background: "rgba(245,166,35,.14)", border: "1px solid var(--gold)", color: "var(--gold)" } : CARD}>{c.name}</Link>)}</div>;
}

export default function CityLanding() {
  const { slug } = useParams();
  const city = slug ? cityBySlug(slug) : undefined;
  const [rows, setRows] = useState<Row[] | null>(null);
  const title = city ? `Sunrise Market ${inCity(city.name)} — ogłoszenia, usługi, nieruchomości, OZE` : "Sunrise Market w Twoim mieście — ogłoszenia i usługi w całej Polsce";
  const desc = city ? `Kupuj i sprzedawaj ${inCity(city.name)}: produkty, usługi z terminarzem, nieruchomości, motoryzacja oraz fotowoltaika i pompy ciepła z montażem. Cashback 3% i Ochrona Kupujących przy każdej transakcji.` : `Sunrise Market to marketplace dla wszystkich — lokalnych sprzedawców, firm i marek własnych Sunrise (OZE z dojazdem do ${SERVICE_RADIUS_KM} km). Wybierz swoje miasto.`;
  useSeo(title, desc, city ? `/miasto/${city.slug}` : "/miasto");

  useEffect(() => {
    if (!city) { setRows([]); return; }
    let alive = true; setRows(null);
    supabase.rpc("city_offers", { p_slug: city.slug, p_limit: 24 }).then(({ data }) => { if (alive) setRows((data as Row[]) ?? []); });
    return () => { alive = false; };
  }, [city?.slug]);

  // JSON-LD: Service + areaServed (lokalne SEO)
  useEffect(() => {
    const el = document.createElement("script"); el.type = "application/ld+json"; el.id = "ld-city";
    el.text = JSON.stringify(city ? { "@context": "https://schema.org", "@type": "WebPage", name: title, description: desc, url: `https://sunrisemarket.pl/miasto/${city.slug}`, about: { "@type": "City", name: city.name }, publisher: { "@type": "Organization", name: "Sunrise Market", url: "https://sunrisemarket.pl" } } : { "@context": "https://schema.org", "@type": "Organization", name: "Sunrise Market", url: "https://sunrisemarket.pl", areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })) });
    document.getElementById("ld-city")?.remove(); document.head.appendChild(el);
    return () => { el.remove(); };
  }, [city?.slug]);

  if (slug && !city) return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}><SiteHeader active="energy" /><div className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="text-2xl font-bold">Nie mamy jeszcze strony tego miasta</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Wybierz miasto z listy albo wpisz miejscowość w wyszukiwarce:</p><CityLinks className="mt-4" /></div><HomeFooter /></main>;

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader active="energy" />
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <Breadcrumbs items={[{ label: "Strona główna", to: "/" }, ...(city ? [{ label: "Miasta", to: "/miasto" }, { label: city.name }] : [{ label: "Miasta" }])]} />

      {city ? <>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET · {city.region.toUpperCase()}</div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight xl:text-4xl">Kupuj i sprzedawaj <span style={{ color: "var(--gold)" }}>{inCity(city.name)}</span></h1>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--mut)" }}>Sunrise Market to jedno miejsce dla wszystkich {inCity(city.name)}: produkty od lokalnych sprzedawców i firm, usługi z terminarzem, nieruchomości, motoryzacja, a także fotowoltaika, pompy ciepła i magazyny energii marek własnych Sunrise z montażem i dojazdem. Każda transakcja idzie przez Sunrise — z cashbackiem 3% i Ochroną Kupujących.</p>
            <div className="mt-5 flex flex-wrap gap-3"><a href="#oferty" className="flex h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Zobacz oferty {inCity(city.name)}</a><Link to="/sprzedawca/wystaw" className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>Sprzedajesz {inCity(city.name)}? Dodaj ogłoszenie</Link></div>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="bag" tint="amber" size={44} /><div><div className="font-bold">Dla lokalnych sprzedawców i firm</div><div className="text-xs" style={{ color: "var(--mut)" }}>Pierwszy rok bez opłat, odbiór osobisty, wiadomości i wypłaty na Sunrise Pay</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="shield" tint="green" size={44} /><div><div className="font-bold">Cashback 3% i Ochrona Kupujących</div><div className="text-xs" style={{ color: "var(--mut)" }}>Sprzedawca dostaje pieniądze dopiero po Twoim odbiorze</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="bolt" tint="orange" size={44} /><div><div className="font-bold">OZE z montażem — {city.km} km od Nowego Tomyśla</div><div className="text-xs" style={{ color: "var(--mut)" }}>Marki własne Sunrise: PV, pompy ciepła, magazyny energii, Protect Plus — dojazd w cenie</div></div></div>
          </div>
        </div>

        <section id="oferty" className="mt-10 scroll-mt-28">
          <SectionTitle sub={`Prawdziwe oferty sprzedawców i marek Sunrise dostępne ${inCity(city.name)}.`} action={<Link to={`/szukaj?lok=${encodeURIComponent(city.name)}`} className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold" style={CARD}>Wszystkie oferty ›</Link>}>Oferty {inCity(city.name)}</SectionTitle>
          {rows === null ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={CARD} />)}</div>
          : rows.length === 0 ? <div className="mt-5 rounded-2xl p-6 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak ofert w tej chwili — <a href="/legal/kontakt.html" style={{ color: "var(--gold)" }}>napisz do nas</a>, przygotujemy wycenę.</div>
          : <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{rows.map((o) => <Link key={o.offer_id} to={`/produkt/${o.offer_id}`} className="group flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={CARD}><div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--header)" }}>{o.image_url ? <img src={o.image_url} alt={o.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center text-4xl">☀️</div>}</div><div className="flex flex-1 flex-col p-3 sm:p-4"><div className="text-base font-bold sm:text-lg" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div><div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{o.title}</div><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}><span className="rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)", color: "var(--ink)" }}>{o.category}</span><span>📍 {o.location && !/nowy tomy/i.test(o.location) ? o.location : `${city.name} · dojazd`}</span>{timeAgo(o.created_at) && <span className="ml-auto">🕒 {timeAgo(o.created_at)}</span>}</div></div></Link>)}</div>}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[["Kto sprzedaje " + inCity(city.name) + "?", "Lokalni sprzedawcy prywatni, firmy (Partnerzy Handlowi) i marki własne Sunrise. Każdy sprzedawca akceptuje regulamin, a opinie pochodzą wyłącznie od klientów po zakupie."], ["Jak wygląda montaż OZE " + inCity(city.name) + "?", "Po zakupie lub rezerwacji doboru kontaktuje się instalator Sunrise i przyjeżdża z Nowego Tomyśla (" + city.km + " km). W promieniu " + SERVICE_RADIUS_KM + " km dojazd jest w cenie."], ["Jak płacę i co, jeśli coś pójdzie nie tak?", "Płacisz przez Sunrise Market (portfel Sunrise Pay, karta, BLIK) z cashbackiem 3%. Pieniądze trafiają do sprzedawcy dopiero po Twoim odbiorze — to Ochrona Kupujących; spór rozstrzyga operator."]].map(([q, a]) => <div key={q} className="rounded-2xl p-5" style={CARD}><div className="font-bold">{q}</div><p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{a}</p></div>)}
        </section>

        <section className="mt-10"><SectionTitle sub={`Sunrise Market działa w całej Polsce; marki własne Sunrise (OZE) dojeżdżają do ${SERVICE_RADIUS_KM} km od ${BASE_CITY.name}.`}>Inne miasta</SectionTitle><CityLinks current={city.slug} className="mt-4" /></section>
      </> : <>
        <div className="mt-5 text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET W TWOIM MIEŚCIE</div>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight xl:text-4xl">Platforma dla wszystkich — <span style={{ color: "var(--gold)" }}>w całej Polsce</span></h1>
        <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: "var(--mut)" }}>Produkty, usługi, nieruchomości i motoryzacja od lokalnych sprzedawców i firm, a do tego fotowoltaika i pompy ciepła marek własnych Sunrise z montażem do {SERVICE_RADIUS_KM} km od Nowego Tomyśla ({SERVICE_REGIONS.length} województw). Wybierz swoje miasto:</p>
        <CityLinks className="mt-6" />
        <div className="mt-8 flex items-center gap-2 text-sm" style={{ color: "var(--mut)" }}><Ico name="pin" size={16} stroke="var(--gold)" />Nie ma Twojego miasta? <Link to="/szukaj" style={{ color: "var(--gold)" }}>Szukaj ofert</Link> — wpisz miejscowość w filtrze lokalizacji.</div>
      </>}
    </div>
    <HomeFooter />
  </main>;
}
