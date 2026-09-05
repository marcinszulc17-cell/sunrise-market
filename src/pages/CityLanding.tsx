// Strony miast (SEO, decyzja właściciela 2026-09-06): /oze/<slug> — „Fotowoltaika, pompy ciepła i magazyny energii w …”.
// Marki własne Sunrise działają w promieniu 200 km od Nowego Tomyśla; strona pokazuje PRAWDZIWE oferty obsługujące miasto
// (RPC city_offers), odległość i dojazd, FAQ oraz linki do pozostałych miast (linkowanie wewnętrzne). Roboty dostają
// tę samą treść z api/miasto.ts (vercel.json), ludzie — tę stronę. /oze bez sluga = lista miast.
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
  return <div className={`flex flex-wrap gap-2 ${className}`}>{CITIES.map((c) => <Link key={c.slug} to={`/oze/${c.slug}`} aria-current={c.slug === current ? "page" : undefined} className="flex h-10 items-center rounded-xl px-3 text-sm font-medium transition hover:-translate-y-0.5" style={c.slug === current ? { background: "rgba(245,166,35,.14)", border: "1px solid var(--gold)", color: "var(--gold)" } : CARD}>{c.name}</Link>)}</div>;
}

export default function CityLanding() {
  const { slug } = useParams();
  const city = slug ? cityBySlug(slug) : undefined;
  const [rows, setRows] = useState<Row[] | null>(null);
  const title = city ? `Fotowoltaika, pompy ciepła i magazyny energii ${inCity(city.name)}` : "Obszar działania Sunrise — OZE i energia w 200 km od Nowego Tomyśla";
  const desc = city ? `Sunrise ${inCity(city.name)}: fotowoltaika, pompy ciepła, magazyny energii, klimatyzacja i serwis — montaż z dojazdem (${city.km} km od Nowego Tomyśla), cashback 3% i Ochrona Kupujących.` : `Marki własne Sunrise działają w promieniu ${SERVICE_RADIUS_KM} km od Nowego Tomyśla: ${SERVICE_REGIONS.join(", ")}. Sprawdź oferty dla swojego miasta.`;
  useSeo(title, desc, city ? `/oze/${city.slug}` : "/oze");

  useEffect(() => {
    if (!city) { setRows([]); return; }
    let alive = true; setRows(null);
    supabase.rpc("city_offers", { p_slug: city.slug, p_limit: 24 }).then(({ data }) => { if (alive) setRows((data as Row[]) ?? []); });
    return () => { alive = false; };
  }, [city?.slug]);

  // JSON-LD: Service + areaServed (lokalne SEO)
  useEffect(() => {
    const el = document.createElement("script"); el.type = "application/ld+json"; el.id = "ld-city";
    el.text = JSON.stringify(city ? { "@context": "https://schema.org", "@type": "Service", name: title, provider: { "@type": "Organization", name: "Sunrise Market", url: "https://sunrisemarket.pl" }, areaServed: { "@type": "City", name: city.name }, serviceType: ["Fotowoltaika", "Pompy ciepła", "Magazyny energii", "Klimatyzacja"], url: `https://sunrisemarket.pl/oze/${city.slug}` } : { "@context": "https://schema.org", "@type": "Organization", name: "Sunrise Market", url: "https://sunrisemarket.pl", areaServed: CITIES.map((c) => ({ "@type": "City", name: c.name })) });
    document.getElementById("ld-city")?.remove(); document.head.appendChild(el);
    return () => { el.remove(); };
  }, [city?.slug]);

  if (slug && !city) return <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}><SiteHeader active="energy" /><div className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="text-2xl font-bold">Nie obsługujemy jeszcze tego miasta</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Sprawdź miasta w naszym zasięgu:</p><CityLinks className="mt-4" /></div><HomeFooter /></main>;

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader active="energy" />
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <Breadcrumbs items={[{ label: "Strona główna", to: "/" }, { label: "OZE i Energia", to: "/szukaj?kat=oze-i-energia" }, ...(city ? [{ label: "Obszar działania", to: "/oze" }, { label: city.name }] : [{ label: "Obszar działania" }])]} />

      {city ? <>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>SUNRISE · {city.region.toUpperCase()}</div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight xl:text-4xl">Fotowoltaika, pompy ciepła i magazyny energii <span style={{ color: "var(--gold)" }}>{inCity(city.name)}</span></h1>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--mut)" }}>Marki własne Sunrise — instalacje fotowoltaiczne, pompy ciepła, magazyny energii, klimatyzacja i programy serwisowe Protect Plus — są dostępne {inCity(city.name)} i w okolicy. Działamy z Nowego Tomyśla w promieniu {SERVICE_RADIUS_KM} km; {city.name} leży {city.km} km od nas, więc dobór, montaż i serwis realizujemy z dojazdem, bez pośredników.</p>
            <div className="mt-5 flex flex-wrap gap-3"><a href="#oferty" className="flex h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Zobacz oferty {inCity(city.name)}</a><Link to="/szukaj?kat=oze-i-energia&tryb=appointment" className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>Umów dobór instalacji</Link></div>
          </div>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="pin" tint="amber" size={44} /><div><div className="font-bold">{city.km} km od Nowego Tomyśla</div><div className="text-xs" style={{ color: "var(--mut)" }}>Dojazd wliczony w wycenę na terenie {city.region}</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="sun" tint="orange" size={44} /><div><div className="font-bold">Cashback 3% i Ochrona Kupujących</div><div className="text-xs" style={{ color: "var(--mut)" }}>Płacisz przez Sunrise — wykonawca dostaje pieniądze po odbiorze</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl p-4" style={CARD}><IconTile name="shield" tint="green" size={44} /><div><div className="font-bold">Protect Plus — serwis i ochrona</div><div className="text-xs" style={{ color: "var(--mut)" }}>Programy serwisowe dla PV, pomp ciepła i magazynów energii</div></div></div>
          </div>
        </div>

        <section id="oferty" className="mt-10 scroll-mt-28">
          <SectionTitle sub={`Prawdziwe oferty Sunrise dostępne ${inCity(city.name)}.`} action={<Link to={`/szukaj?kat=oze-i-energia&lok=${encodeURIComponent(city.name)}`} className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold" style={CARD}>Wszystkie oferty ›</Link>}>Oferty {inCity(city.name)}</SectionTitle>
          {rows === null ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={CARD} />)}</div>
          : rows.length === 0 ? <div className="mt-5 rounded-2xl p-6 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak ofert w tej chwili — <a href="/legal/kontakt.html" style={{ color: "var(--gold)" }}>napisz do nas</a>, przygotujemy wycenę.</div>
          : <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{rows.map((o) => <Link key={o.offer_id} to={`/produkt/${o.offer_id}`} className="group flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={CARD}><div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--header)" }}>{o.image_url ? <img src={o.image_url} alt={o.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center text-4xl">☀️</div>}</div><div className="flex flex-1 flex-col p-3 sm:p-4"><div className="text-base font-bold sm:text-lg" style={{ color: "var(--gold)" }}>{zl(o.price_gross)}</div><div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5">{o.title}</div><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}><span className="rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)", color: "var(--ink)" }}>{o.category}</span><span>📍 {city.name} · dojazd</span>{timeAgo(o.created_at) && <span className="ml-auto">🕒 {timeAgo(o.created_at)}</span>}</div></div></Link>)}</div>}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[["Jak wygląda montaż " + inCity(city.name) + "?", "Po zakupie lub rezerwacji doboru kontaktuje się instalator Sunrise, ustala termin i przyjeżdża z Nowego Tomyśla (" + city.km + " km). Montaż i uruchomienie są w cenie ofert oznaczonych „montaż”."], ["Czy dojazd jest płatny?", "Nie — w promieniu " + SERVICE_RADIUS_KM + " km od Nowego Tomyśla dojazd jest wliczony. " + city.name + " leży w tym zasięgu."], ["Jak płacę i co z gwarancją?", "Płacisz przez Sunrise Market (portfel Sunrise Pay, karta, BLIK) z cashbackiem 3%. Pieniądze trafiają do wykonawcy dopiero po Twoim odbiorze — to Ochrona Kupujących. Serwis i ochronę zapewnia Protect Plus."]].map(([q, a]) => <div key={q} className="rounded-2xl p-5" style={CARD}><div className="font-bold">{q}</div><p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{a}</p></div>)}
        </section>

        <section className="mt-10"><SectionTitle sub={`Promień ${SERVICE_RADIUS_KM} km od ${BASE_CITY.name}: ${SERVICE_REGIONS.join(", ")}.`}>Inne miasta w zasięgu</SectionTitle><CityLinks current={city.slug} className="mt-4" /></section>
      </> : <>
        <div className="mt-5 text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>OBSZAR DZIAŁANIA</div>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight xl:text-4xl">OZE i energia w promieniu <span style={{ color: "var(--gold)" }}>{SERVICE_RADIUS_KM} km</span> od Nowego Tomyśla</h1>
        <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: "var(--mut)" }}>Fotowoltaika, pompy ciepła, magazyny energii, klimatyzacja i programy serwisowe Sunrise — z dojazdem i montażem w województwach: {SERVICE_REGIONS.join(", ")}. Wybierz swoje miasto:</p>
        <CityLinks className="mt-6" />
        <div className="mt-8 flex items-center gap-2 text-sm" style={{ color: "var(--mut)" }}><Ico name="pin" size={16} stroke="var(--gold)" />Nie ma Twojego miasta? <Link to="/szukaj?kat=oze-i-energia" style={{ color: "var(--gold)" }}>Sprawdź oferty</Link> — jeśli leżysz w zasięgu 200 km, dojedziemy.</div>
      </>}
    </div>
    <HomeFooter />
  </main>;
}
