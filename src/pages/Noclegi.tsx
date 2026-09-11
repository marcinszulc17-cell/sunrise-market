// Wyszukiwarka noclegów (decyzja właściciela 2026-09-10: „ma być jak na Booking").
// Pasek: dokąd / termin od–do / liczba osób. Dostępność liczy baza (RPC search_stays),
// więc na liście są WYŁĄCZNIE obiekty wolne w każdą dobę pobytu — nie pokazujemy nic,
// czego klient nie może zarezerwować.
// Stan pusty jest tu równie ważny jak wyniki: katalog noclegowy dopiero się buduje.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchStays, type Stay } from "../lib/api";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";
import { SiteHeader, Breadcrumbs } from "../components/home/SiteChrome";
import { Ico, HomeFooter, CARD, GOLD_GRAD } from "../components/home/HomeShared";

const input = "w-full rounded-xl px-3 py-2.5 outline-none";
const inputStyle: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" };

// Te same slugi, co w ustawieniach obiektu u sprzedawcy (SellerBookingSetup).
const AMENITIES = [
  { id: "wifi", icon: "📶", label: "Wi-Fi" },
  { id: "parking", icon: "🅿️", label: "Parking" },
  { id: "sniadanie", icon: "🥐", label: "Śniadanie" },
  { id: "kuchnia", icon: "🍳", label: "Kuchnia" },
  { id: "klimatyzacja", icon: "❄️", label: "Klimatyzacja" },
  { id: "pralka", icon: "🧺", label: "Pralka" },
  { id: "basen", icon: "🏊", label: "Basen" },
  { id: "sauna", icon: "🧖", label: "Sauna" },
  { id: "zwierzeta", icon: "🐾", label: "Zwierzęta OK" },
  { id: "taras", icon: "🌿", label: "Taras / ogród" },
  { id: "kominek", icon: "🔥", label: "Kominek" },
  { id: "winda", icon: "🛗", label: "Winda" },
];
const AMENITY_LABEL: Record<string, string> = Object.fromEntries(AMENITIES.map((a) => [a.id, `${a.icon} ${a.label}`]));

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const nightsWord = (n: number) => (n === 1 ? "noc" : n < 5 ? "noce" : "nocy");

export default function Noclegi() {
  const [sp, setSp] = useSearchParams();
  const [where, setWhere] = useState(sp.get("gdzie") ?? "");
  const [from, setFrom] = useState(sp.get("od") ?? "");
  const [to, setTo] = useState(sp.get("do") ?? "");
  const [guests, setGuests] = useState(Number(sp.get("osoby") ?? 2));
  const [amenities, setAmenities] = useState<string[]>((sp.get("udogodnienia") ?? "").split(",").filter(Boolean));
  const [rows, setRows] = useState<Stay[] | null>(null);
  const [err, setErr] = useState("");

  useSeo("Noclegi — Sunrise Market", "Domki, apartamenty, kwatery i hotele. Rezerwuj online, płać Sunrise Pay albo kartą i odbieraj 3% cashbacku.", "/noclegi");

  const nights = useMemo(() => (from && to ? Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 86400000)) : 0), [from, to]);
  const datesInvalid = Boolean(from && to && nights <= 0);

  async function run() {
    if (datesInvalid) { setErr("Data wyjazdu musi być późniejsza niż przyjazdu."); return; }
    setErr(""); setRows(null);
    try {
      setRows(await searchStays({ query: where.trim() || null, from: from || null, to: to || null, guests, amenities }));
    } catch (e) { setErr((e as Error).message); setRows([]); }
  }

  // Pierwsze wejście i każda zmiana adresu (np. z linku) — szukamy od razu.
  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (where.trim()) next.set("gdzie", where.trim());
    if (from) next.set("od", from);
    if (to) next.set("do", to);
    if (guests) next.set("osoby", String(guests));
    if (amenities.length) next.set("udogodnienia", amenities.join(","));
    setSp(next, { replace: true });
    run();
  }

  function toggleAmenity(id: string) {
    setAmenities((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return <main className="min-h-screen pb-16" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 xl:px-10">
      <Breadcrumbs items={[{ label: "Strona główna", to: "/" }, { label: "Noclegi" }]} />

      <h1 className="mt-2 text-3xl font-bold">Noclegi</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Domki, apartamenty, kwatery i hotele — rezerwacja online, 3% cashbacku na portfel i Ochrona Kupujących.</p>

      {/* Pasek wyszukiwania — dokąd / termin / liczba osób */}
      <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl p-4 lg:grid-cols-[2fr_1fr_1fr_auto_auto]" style={CARD}>
        <label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Dokąd jedziesz?</span>
          <input className={input} style={inputStyle} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Miasto, region albo nazwa obiektu" /></label>
        <label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Przyjazd</span>
          <input type="date" min={today()} className={input} style={inputStyle} value={from} onChange={(e) => { setFrom(e.target.value); if (to && e.target.value >= to) setTo(plusDays(e.target.value, 1)); }} /></label>
        <label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Wyjazd</span>
          <input type="date" min={from ? plusDays(from, 1) : today()} className={input} style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Osoby</span>
          <input type="number" min={1} max={30} className={`${input} lg:w-24`} style={inputStyle} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))} /></label>
        <button className="mt-auto flex h-[46px] items-center justify-center gap-2 rounded-xl px-6 font-bold text-black" style={{ background: GOLD_GRAD }}><Ico name="search" size={18} stroke="#101012" />Szukaj</button>
      </form>

      {/* Udogodnienia — filtr działa na tych samych znacznikach, które ustawia właściciel obiektu */}
      <div className="mt-3 flex flex-wrap gap-2">
        {AMENITIES.map((a) => { const on = amenities.includes(a.id); return <button type="button" key={a.id} onClick={() => toggleAmenity(a.id)} className="min-h-[40px] rounded-full px-3 py-2 text-sm" style={on ? { background: "rgba(245,166,35,.14)", border: "1px solid var(--gold)", color: "var(--gold)" } : { background: "rgba(255,255,255,.04)", border: "1px solid var(--line)", color: "var(--ink)" }}>{a.icon} {a.label}</button>; })}
        {amenities.length > 0 && <button type="button" onClick={() => setAmenities([])} className="min-h-[40px] px-3 text-sm underline" style={{ color: "var(--mut)" }}>Wyczyść</button>}
      </div>

      {err && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(232,137,26,.12)", color: "var(--gold)" }}>{err}</div>}

      {nights > 0 && <p className="mt-4 text-sm" style={{ color: "var(--mut)" }}>{nights} {nightsWord(nights)} · {guests} {guests === 1 ? "osoba" : "osoby"}{rows ? ` · znaleziono ${rows.length}` : ""}</p>}

      {/* Wyniki */}
      {rows === null ? <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl" style={CARD} />)}</div>
        : rows.length === 0 ? <EmptyState hasFilters={Boolean(where || from || amenities.length)} onReset={() => { setWhere(""); setFrom(""); setTo(""); setAmenities([]); setSp(new URLSearchParams(), { replace: true }); run(); }} />
        : <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{rows.map((s) => <StayCard key={s.offer_id} s={s} />)}</div>}
    </div>
    <HomeFooter />
  </main>;
}

function StayCard({ s }: { s: Stay }) {
  const href = `/produkt/${s.offer_id}`;
  return <article className="group overflow-hidden rounded-2xl transition hover:-translate-y-0.5" style={CARD}>
    <Link to={href} className="block aspect-[4/3] overflow-hidden" style={{ background: "var(--header)" }} tabIndex={-1} aria-hidden="true">
      {s.image_url ? <img src={s.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center text-3xl">🏡</div>}
    </Link>
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-lg font-bold" style={{ color: "var(--gold)" }}>{zl(s.nightly_from ?? 0)} <span className="text-xs font-medium" style={{ color: "var(--mut)" }}>/ noc</span></div>
        {s.rating ? <span className="shrink-0 text-xs" style={{ color: "var(--gold)" }}>★ {s.rating.toFixed(1)} <span style={{ color: "var(--mut)" }}>({s.reviews})</span></span> : null}
      </div>
      <Link to={href} className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 focus-visible:underline">{s.title}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--mut)" }}>
        {s.category && <span className="truncate rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--line)", color: "var(--ink)" }}>{s.category}</span>}
        {s.location && <span className="truncate">📍 {s.location}</span>}
        {s.max_guests ? <span className="shrink-0">· do {s.max_guests} os.</span> : null}
      </div>
      {s.amenities.length > 0 && <div className="mt-2 line-clamp-1 text-[11px]" style={{ color: "var(--mut)" }}>{s.amenities.slice(0, 4).map((a) => AMENITY_LABEL[a] ?? a).join(" · ")}</div>}
      {s.total_gross !== null && s.nights ? <div className="mt-2 text-sm font-semibold">{zl(s.total_gross)} <span className="font-normal" style={{ color: "var(--mut)" }}>za {s.nights} {nightsWord(s.nights)}{s.cleaning_fee_gross ? " ze sprzątaniem" : ""}</span></div> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(122,184,154,.12)" }}>3% cashback</span>
        {s.instant_booking && <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(56,224,240,.10)" }}>⚡ Rezerwacja natychmiastowa</span>}
        {s.deposit_gross ? <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(232,137,26,.10)" }}>Kaucja {zl(s.deposit_gross)}</span> : null}
      </div>
    </div>
  </article>;
}

/** Katalog noclegowy dopiero się buduje — pusty ekran ma prowadzić dalej, a nie kończyć wizytę. */
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return <div className="mt-6 rounded-2xl p-8 text-center" style={CARD}>
    <div className="text-4xl">🏡</div>
    <h2 className="mt-3 text-xl font-bold">{hasFilters ? "Brak wolnych obiektów dla tych kryteriów" : "Budujemy bazę noclegów"}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm" style={{ color: "var(--mut)" }}>
      {hasFilters
        ? "Spróbuj innego terminu, mniejszej liczby osób albo zdejmij część udogodnień. Pokazujemy wyłącznie obiekty naprawdę wolne w wybranych dniach."
        : <>Zapraszamy właścicieli domków, apartamentów i kwater. Prowizja 7,9% zamiast kilkunastu procent, wypłata na Sunrise Pay, a Twój gość dostaje 3% cashbacku. <Link to="/dla-obiektow" className="underline" style={{ color: "var(--gold)" }}>Zobacz warunki dla obiektów ›</Link></>}
    </p>
    <div className="mt-5 flex flex-wrap justify-center gap-3">
      {hasFilters && <button onClick={onReset} className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>Wyczyść filtry</button>}
      <Link to="/sprzedawca/wystaw?typ=produkt&mode=daily" className="flex h-11 items-center rounded-xl px-5 text-sm font-bold text-black" style={{ background: GOLD_GRAD }}>Wystaw swój obiekt</Link>
      <Link to="/sklep" className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>Przeglądaj inne oferty</Link>
    </div>
  </div>;
}
