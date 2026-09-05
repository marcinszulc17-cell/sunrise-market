// „O nas” — strona statyczna na wspólnej ramie (SiteChrome). Tylko fakty z regulaminów i konfiguracji:
// operator Green Eco World Sp. z o.o. (Nowy Tomyśl), ekosystem Sunrise / MySunrise, Sunrise Pay, cashback 3%,
// Ochrona Kupujących (wypłata sprzedawcy po odbiorze, auto po 14 dniach), dwa poziomy sprzedawców.
// Bez wymyślonych liczb (liczby użytkowników, ofert itd.).
import { Link } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { SiteHeader, SectionTitle } from "../components/home/SiteChrome";
import { Ico, IconTile, HomeFooter, GOLD_GRAD, CARD, type IconName, type Tint } from "../components/home/HomeShared";

const PILLARS: { icon: IconName; tint: Tint; title: string; text: string }[] = [
  { icon: "shield", tint: "green", title: "Ochrona Kupujących", text: "Każda płatność idzie przez Sunrise. Sprzedawca dostaje pieniądze dopiero, gdy potwierdzisz odbiór — albo automatycznie po 14 dniach, jeśli nie zgłosisz problemu. Spór rozstrzyga operator." },
  { icon: "sun", tint: "amber", title: "Cashback 3% przy każdej płatności", text: "Portfel Sunrise Pay, karta, BLIK czy P24 — po każdym zakupie 3% wartości wraca na Twój portfel. Bez programów lojalnościowych i drobnego druku." },
  { icon: "bag", tint: "violet", title: "Zakupy, rezerwacje i ogłoszenia w jednym", text: "Produkty, usługi z terminarzem, wynajem, nieruchomości, motoryzacja, OZE — jedno konto, jeden koszyk, jedna historia zamówień." },
  { icon: "user", tint: "blue", title: "Zweryfikowani sprzedawcy", text: "Sprzedawcy prywatni i Partnerzy Handlowi z NIP akceptują regulamin, a ich opinie pochodzą wyłącznie od klientów, którzy naprawdę kupili. Sunrise Verify sprawdza auta i nieruchomości." },
];

export default function ONas() {
  useSeo("O nas — Sunrise Market", "Sunrise Market to marketplace ekosystemu Sunrise: zakupy, rezerwacje, nieruchomości, motoryzacja i usługi z cashbackiem 3% i Ochroną Kupujących.", "/o-nas");
  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight xl:text-5xl">Bliżej ludzi. <span style={{ color: "var(--gold)" }}>Bliżej możliwości.</span></h1>
      <p className="mt-4 max-w-3xl text-lg leading-8" style={{ color: "var(--mut)" }}>Sunrise Market to marketplace ekosystemu Sunrise — miejsce, w którym kupujesz produkty, rezerwujesz usługi, szukasz mieszkania albo auta i sprzedajesz własne rzeczy, a każda transakcja jest zabezpieczona przez Sunrise i nagradzana cashbackiem.</p>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {PILLARS.map((p) => <div key={p.title} className="flex gap-4 rounded-2xl p-5" style={CARD}><IconTile name={p.icon} tint={p.tint} size={48} /><div><div className="font-bold">{p.title}</div><p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{p.text}</p></div></div>)}
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionTitle>Skąd się wzięliśmy</SectionTitle>
          <div className="mt-4 flex flex-col gap-4 text-base leading-7" style={{ color: "var(--mut)" }}>
            <p>Sunrise zaczynało od energii — fotowoltaiki, pomp ciepła i magazynów energii dla domów w Wielkopolsce. Z czasem wokół tych usług powstał ekosystem marek MySunrise: portfel Sunrise Pay, klub ambasadorów, programy ochrony i serwisu. Sunrise Market jest jego rynkiem — miejscem, gdzie te marki i niezależni sprzedawcy spotykają się z klientami.</p>
            <p>Wierzymy, że lokalny handel zasługuje na narzędzia, jakie mają wielkie platformy: bezpieczną płatność, jasne zasady zwrotów, prawdziwe opinie i uczciwy udział w zysku. Dlatego sprzedawca w Sunrise Market przez pierwszy rok nie płaci nic, a klient przy każdej płatności dostaje 3% z powrotem.</p>
            <p>Działamy z Nowego Tomyśla. Operatorem serwisu jest Green Eco World Sp. z o.o.</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="rounded-2xl p-5" style={CARD}><div className="text-sm font-bold">Dla kupujących</div><ul className="mt-2 grid gap-1.5 text-sm" style={{ color: "var(--mut)" }}><li>✓ Cashback 3% na portfel Sunrise Pay</li><li>✓ Ochrona Kupujących i 14 dni na zwrot</li><li>✓ Rezerwacje usług z płatnością od razu</li><li>✓ Odbiór osobisty u sprzedawcy bez kosztów wysyłki</li></ul><Link to="/sklep" className="mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Przeglądaj oferty</Link></div>
          <div className="rounded-2xl p-5" style={CARD}><div className="text-sm font-bold">Dla sprzedających</div><ul className="mt-2 grid gap-1.5 text-sm" style={{ color: "var(--mut)" }}><li>✓ Pierwszy rok bez opłat, potem 299 zł / rok (sprzedawca) lub 499 zł / rok (Partner Handlowy)</li><li>✓ Prowizja 7,9% (Sunrise Pay) / 12,9% (karta)</li><li>✓ Wypłaty na portfel Sunrise Pay po odbiorze przez klienta</li><li>✓ Publiczny profil z opiniami i odznakami</li></ul><Link to="/sprzedawca/dolacz" className="mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Zostań sprzedawcą</Link></div>
        </div>
      </section>

      <section className="mt-12 rounded-2xl p-6" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.14),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: "rgba(245,166,35,.16)", color: "var(--gold)" }}><Ico name="user" size={22} /></div>
          <div className="min-w-0 flex-1"><div className="font-bold">Masz pytanie albo pomysł?</div><div className="text-sm" style={{ color: "var(--mut)" }}>Odpowiadamy zwykle w ciągu jednego dnia roboczego. Najczęstsze pytania zebraliśmy w Pomocy.</div></div>
          <Link to="/pomoc" className="flex h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Pomoc</Link>
          <a href="/legal/kontakt.html" className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>Kontakt</a>
        </div>
      </section>
    </div>
    <HomeFooter />
  </main>;
}
