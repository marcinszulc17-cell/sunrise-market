// Strona pozyskania obiektów noclegowych (decyzja właściciela 2026-09-11: „pozyskaj nam
// klientów do naszej bazy"). Katalog noclegowy budujemy własnymi obiektami — to jedyny
// wariant, w którym rezerwacja zostaje u nas: płatność Sunrise Pay, cashback dla gościa,
// prowizja 7,9% zamiast kilkunastu procent u pośredników.
// Wszystkie liczby na tej stronie muszą zgadzać się z cennikiem (market.pricing_list)
// i z Regulaminem sprzedawcy — nie dopisujemy tu obietnic, których nie realizujemy.
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { SiteHeader } from "../components/home/SiteChrome";
import { HomeFooter, CARD, GOLD_GRAD, Ico, type IconName } from "../components/home/HomeShared";
import { pricingList } from "../lib/api";
import { useSeo } from "../lib/seo";
import { zl } from "../lib/money";

type Prices = { commission_rate?: number; stripe_commission_rate?: number; cashback_rate?: number; pay_free_months?: number; trade_partner_annual_fee?: number; pay_annual_fee?: number };

const pct = (v?: number, d = 1) => `${((v ?? 0) * 100).toFixed(d).replace(".", ",").replace(",0", "")}%`;

export default function DlaObiektow() {
  const [p, setP] = useState<Prices>({});
  useEffect(() => { pricingList().then((x) => setP((x ?? {}) as Prices)).catch(() => {}); }, []);
  useSeo(
    "Wystaw nocleg w Sunrise Market — prowizja 7,9%",
    "Domki, apartamenty, pokoje i kwatery. Prowizja 7,9% przy płatności Sunrise Pay, pierwszy rok bez opłaty rocznej, wypłata po pobycie gościa, cashback 3% dla Twojego gościa.",
    "/dla-obiektow",
  );

  const prowizja = pct(p.commission_rate ?? 0.079);
  const prowizjaKarta = pct(p.stripe_commission_rate ?? 0.129);
  const cashback = pct(p.cashback_rate ?? 0.03, 0);
  const free = p.pay_free_months ?? 12;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-[.26em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET · NOCLEGI</div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">Wystaw swój obiekt i zatrzymaj więcej z każdej doby</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: "var(--mut)" }}>
            Domki, apartamenty, pokoje, kwatery i agroturystyka. Rezerwacja i płatność odbywają się u nas,
            a Ty rozliczasz się jedną prowizją — bez opłat za wystawienie i bez opłat za zapytania.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/sprzedawca/dolacz" className="grid h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj obiekt</Link>
            <Link to="/noclegi" className="grid h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ ...CARD }}>Zobacz, jak wygląda wyszukiwarka</Link>
          </div>
        </div>

        {/* Liczby — wszystkie z cennika platformy */}
        <section className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            { v: prowizja, l: "prowizja przy płatności Sunrise Pay" },
            { v: prowizjaKarta, l: "prowizja przy karcie, BLIK-u i Przelewy24" },
            { v: `${free} mies.`, l: "bez opłaty rocznej na start" },
            { v: cashback, l: "cashbacku dostaje Twój gość" },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl p-4 text-center" style={CARD}>
              <div className="text-2xl font-bold" style={{ color: "var(--gold)" }}>{x.v}</div>
              <div className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>{x.l}</div>
            </div>
          ))}
        </section>

        {/* Co dostajesz */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Co dostajesz</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["calendar", "Kalendarz dostępności", "Ustalasz doby, ceny sezonowe, minimalny i maksymalny pobyt oraz blokady. Wyszukiwarka pokazuje gościom wyłącznie terminy naprawdę wolne."],
              ["user", "Liczba gości i doba hotelowa", "Maksymalna liczba osób, godziny zameldowania i wymeldowania oraz udogodnienia (wifi, parking, śniadanie, basen, zwierzęta) — filtrowane po stronie bazy."],
              ["shield", "Pieniądze pod ochroną", "Gość płaci przy rezerwacji, Ty dostajesz wypłatę po pobycie. Możesz pobierać kaucję zwrotną i opłatę za sprzątanie."],
              ["cart", "Rezerwacja natychmiastowa albo na potwierdzenie", "Sam decydujesz, czy termin blokuje się od razu, czy najpierw go akceptujesz."],
              ["sun", "Gość z cashbackiem", "Każda rezerwacja zwraca gościowi 3% na portfel Sunrise Pay — to nasz koszt pozyskania, nie Twój."],
              ["plus", "Bez opłat za start", "Aktywacja 0 zł, pierwszy rok bez opłaty rocznej, potem 299 zł rocznie (konto Sprzedawcy) lub 499 zł (firma)."],
            ] as [IconName, string, string][]).map(([icon, t, d]) => (
              <div key={t} className="flex gap-3 rounded-2xl p-4" style={CARD}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(245,166,35,.14)", color: "var(--gold)" }}><Ico name={icon} size={20} /></span>
                <div className="min-w-0">
                  <div className="font-semibold">{t}</div>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Kalkulator prowizji — liczy na danych właściciela, nie na naszym przykładzie.
            Stawki bierzemy z cennika platformy; prowizję portalu podaje użytkownik,
            bo różni się w zależności od umowy i programów widoczności. */}
        <Kalkulator prowizja={Number(p.commission_rate ?? 0.079)} prowizjaKarta={Number(p.stripe_commission_rate ?? 0.129)} />

        {/* Jak zacząć */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Jak zacząć</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-4">
            {[
              ["1", "Załóż konto sprzedawcy", "Osoba prywatna albo firma — obie ścieżki są dostępne."],
              ["2", "Dodaj obiekt", "Zdjęcia, opis, lokalizacja, cena za dobę."],
              ["3", "Ustaw nocleg", "Liczba gości, doba hotelowa, udogodnienia, kaucja, ceny sezonowe."],
              ["4", "Przyjmuj rezerwacje", "Gość płaci od razu, Ty dostajesz wypłatę po pobycie."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl p-4" style={CARD}>
                <div className="text-xs font-bold" style={{ color: "var(--gold)" }}>KROK {n}</div>
                <div className="mt-1 font-semibold">{t}</div>
                <p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Uczciwie o tym, czego jeszcze nie ma */}
        <section className="mt-8 rounded-2xl p-5" style={{ background: "rgba(143,176,238,.08)", border: "1px solid rgba(143,176,238,.25)" }}>
          <h2 className="font-semibold">Czego jeszcze nie mamy — mówimy wprost</h2>
          <ul className="mt-2 grid gap-1.5 text-sm leading-6" style={{ color: "var(--mut)" }}>
            <li>· Katalog noclegowy dopiero budujemy — pierwsze obiekty mają przewagę widoczności, ale i mniejszy ruch niż na dużych portalach.</li>
            <li>· Nie mamy jeszcze automatycznej synchronizacji kalendarza z Booking.com i Airbnb. Jeśli wystawiasz się też tam, na razie blokady trzeba wprowadzać u nas ręcznie.</li>
            <li>· Nie pobieramy opłat za wystawienie ani za zapytania — zarabiamy wyłącznie na zrealizowanych rezerwacjach.</li>
          </ul>
        </section>

        <div className="mt-8 text-center">
          <Link to="/sprzedawca/dolacz" className="inline-grid h-12 items-center rounded-xl px-6 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Dodaj obiekt — bez opłat na start</Link>
          <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>
            Masz pytania? <a href="/legal/kontakt.html" className="underline" style={{ color: "var(--gold)" }}>Napisz do nas</a> — odpowiadamy w jeden dzień roboczy.
          </p>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}

/** Ile zostaje z sezonu u nas, a ile u pośrednika o wyższej prowizji. */
function Kalkulator({ prowizja, prowizjaKarta }: { prowizja: number; prowizjaKarta: number }) {
  const [cena, setCena] = useState(400);
  const [doby, setDoby] = useState(60);
  const [obca, setObca] = useState(15);

  const obrot = Math.max(0, cena) * Math.max(0, doby);
  const uNas = obrot * (1 - prowizja);
  const uNasKarta = obrot * (1 - prowizjaKarta);
  const uNich = obrot * (1 - Math.max(0, obca) / 100);
  const roznica = uNas - uNich;

  const pole = "h-11 w-full rounded-xl px-3 text-sm outline-none";
  const poleStyle = { background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" } as React.CSSProperties;

  return (
    <section className="mt-8 rounded-2xl p-5" style={CARD}>
      <h2 className="text-lg font-semibold">Policz, ile zostaje u Ciebie</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>
        Wpisz swoje liczby. Prowizję obecnego portalu znajdziesz w swojej umowie — bywa wyższa,
        jeśli korzystasz z programów zwiększających widoczność.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--mut)" }}>Cena za dobę (zł)</span>
          <input className={pole} style={poleStyle} type="number" min={0} step={10} value={cena} onChange={(e) => setCena(Number(e.target.value))} /></label>
        <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--mut)" }}>Wynajętych dób w roku</span>
          <input className={pole} style={poleStyle} type="number" min={0} step={5} value={doby} onChange={(e) => setDoby(Number(e.target.value))} /></label>
        <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--mut)" }}>Prowizja obecnego portalu (%)</span>
          <input className={pole} style={poleStyle} type="number" min={0} max={50} step={0.5} value={obca} onChange={(e) => setObca(Number(e.target.value))} /></label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Obrót z sezonu</div>
          <div className="mt-1 text-xl font-bold">{zl(obrot)}</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Zostaje u obecnego pośrednika</div>
          <div className="mt-1 text-xl font-bold">{zl(uNich)}</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "rgba(122,184,154,.12)", border: "1px solid rgba(122,184,154,.3)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Zostaje w Sunrise Market</div>
          <div className="mt-1 text-xl font-bold" style={{ color: "var(--green)" }}>{zl(uNas)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl p-4 text-sm" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.16),rgba(232,137,26,.04))", border: "1px solid rgba(245,166,35,.35)" }}>
        {roznica > 0
          ? <>Różnica w skali roku: <b style={{ color: "var(--gold)" }}>{zl(roznica)}</b> więcej po Twojej stronie.</>
          : roznica < 0
          ? <>Przy tej prowizji obecny portal wypada korzystniej o <b>{zl(Math.abs(roznica))}</b> — wpisz swoje realne warunki, żeby to sprawdzić.</>
          : <>Przy tych warunkach wychodzi tyle samo.</>}
      </div>

      <p className="mt-3 text-xs leading-5" style={{ color: "var(--mut)" }}>
        Wyliczenie zakłada płatność portfelem Sunrise Pay (prowizja {(prowizja * 100).toFixed(1).replace(".", ",")}%).
        Gdy gość zapłaci kartą, BLIK-iem lub Przelewy24, prowizja wynosi {(prowizjaKarta * 100).toFixed(1).replace(".", ",")}%
        i z sezonu zostaje {zl(uNasKarta)} — metodę płatności wybiera gość, nie Ty.
        To szacunek na podanych liczbach, a nie obietnica przychodu: realny wynik zależy od obłożenia, sezonu i cen.
      </p>
    </section>
  );
}
