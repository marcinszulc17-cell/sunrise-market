// „Pomoc” — FAQ na wspólnej ramie (SiteChrome). Odpowiedzi wyłącznie z obowiązujących zasad (CLAUDE.md, regulaminy):
// płatności i cashback 3%, Ochrona Kupujących (14 dni), zwroty na portfel, rezerwacje, odbiór osobisty, sprzedawanie
// (rok gratis, 299/499 zł, prowizje 7,9%/12,9%), aplikacja i powiadomienia. Wyszukiwarka pytań działa lokalnie.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { SiteHeader, SectionTitle } from "../components/home/SiteChrome";
import { Ico, IconTile, HomeFooter, GOLD_GRAD, CARD, type IconName, type Tint } from "../components/home/HomeShared";

type Faq = { q: string; a: React.ReactNode };
type Group = { id: string; icon: IconName; tint: Tint; title: string; items: Faq[] };

const GROUPS: Group[] = [
  { id: "zakupy", icon: "cart", tint: "amber", title: "Zakupy i płatności", items: [
    { q: "Jak mogę zapłacić?", a: "Portfelem Sunrise Pay (metoda promowana — główny przycisk w koszyku) albo kartą, BLIK-iem lub P24 przez Stripe. Subskrypcje (np. Protect Plus) rozliczamy wyłącznie kartą, co miesiąc z góry." },
    { q: "Co jeśli w portfelu brakuje środków?", a: "Koszyk zaproponuje doładowanie (od 10 zł do 25 000 zł) i sam dokończy zakup po powrocie, albo od razu pokaże płatność kartą, gdy brakująca kwota przekracza limit doładowania." },
    { q: "Czy dostanę fakturę?", a: "Partnerzy Handlowi (firmy z NIP) wystawiają faktury z panelu sprzedawcy; przy ofertach oznaczonych „Pełna faktura VAT” dokument otrzymasz do zamówienia. Sprzedawcy prywatni wystawiają dowód sprzedaży." },
    { q: "Jak skontaktować się ze sprzedawcą?", a: <>Na stronie oferty kliknij <b>Napisz do sprzedawcy</b> — rozmowa trafia do <Link to="/wiadomosci" style={{ color: "var(--gold)" }}>Wiadomości</Link>, a sprzedawca dostaje powiadomienie. Jeśli sprzedawca udostępnił numer, zalogowani zobaczą przycisk <b>Pokaż numer</b>. Przy autach i nieruchomościach jest też <b>Umów oględziny / prezentację</b> z wyborem terminu.</> },
    { q: "Ile kosztuje dostawa?", a: "Zależy od sprzedawcy i metody: Paczkomat InPost, kurier InPost lub DPD. Przy ofertach z odbiorem osobistym wybierzesz w koszyku „Odbiór osobisty u sprzedawcy” za 0 zł." },
  ] },
  { id: "cashback", icon: "sun", tint: "orange", title: "Cashback i portfel Sunrise Pay", items: [
    { q: "Ile wynosi cashback i kiedy go dostanę?", a: "3% wartości zakupu przy każdej metodzie płatności — portfel, karta, BLIK, P24, a także przy każdym odnowieniu subskrypcji. Punkty trafiają na Twój portfel Sunrise Pay po opłaceniu zamówienia." },
    { q: "Czy cashback przepada przy zwrocie?", a: "Tak — przy zwrocie zamówienia cofamy również naliczony cashback za to zamówienie. Nigdy nie schodzimy poniżej zera na Twoim saldzie z innych zakupów." },
    { q: "Gdzie sprawdzę saldo i historię?", a: <>W zakładce <Link to="/portfel" style={{ color: "var(--gold)" }}>Portfel</Link> widzisz saldo, punkty cashback, doładowania i wypłaty. Portfel jest wspólny dla całego ekosystemu MySunrise.</> },
  ] },
  { id: "ochrona", icon: "shield", tint: "green", title: "Ochrona Kupujących, zwroty i spory", items: [
    { q: "Na czym polega Ochrona Kupujących?", a: "Każda płatność idzie przez Sunrise. Sprzedawca dostaje pieniądze dopiero, gdy potwierdzisz odbiór (w Zamówieniach), gdy kurier doręczy przesyłkę albo automatycznie po 14 dniach, jeśli nie zgłosisz problemu. Wyjątkiem są subskrypcje — usługa ciągła rozliczana od razu." },
    { q: "Jak zgłosić problem z zamówieniem?", a: <>W <Link to="/zamowienia" style={{ color: "var(--gold)" }}>Zamówieniach</Link> przy zamówieniu kliknij „Zgłoś problem” w oknie ochrony. Wypłata sprzedawcy zostaje wstrzymana, a operator rozstrzyga spór: zwalnia pieniądze, odrzuca zgłoszenie albo robi zwrot.</> },
    { q: "Ile mam czasu na zwrot?", a: <>14 dni od otrzymania towaru, bez podania przyczyny. Zgłoś zwrot w Zamówieniach; po weryfikacji towaru środki wracają na Twój portfel Sunrise Pay. Szczegóły: <a href="/legal/zwroty.html" style={{ color: "var(--gold)" }}>Zwroty i reklamacje</a>.</> },
    { q: "Sprzedawca nie wysłał zamówienia — co dalej?", a: "Jeśli opłacone zamówienie nie zostało wysłane w 30 dni, dostaniesz powiadomienie z możliwością anulowania i zwrotu. Nie anulujemy niczego automatycznie bez Twojej decyzji." },
  ] },
  { id: "rezerwacje", icon: "calendar", tint: "violet", title: "Rezerwacje i wynajem", items: [
    { q: "Jak zarezerwować usługę?", a: <>Wejdź w <Link to="/szukaj?tryb=appointment" style={{ color: "var(--gold)" }}>Rezerwacje</Link>, wybierz ofertę, dzień i godzinę z kalendarza sprzedawcy i opłać rezerwację. Termin trafia do <Link to="/rezerwacje" style={{ color: "var(--gold)" }}>Moje rezerwacje</Link>, a przypomnienia dostaniesz powiadomieniem.</> },
    { q: "Czym różni się wynajem od rezerwacji terminu?", a: "Rezerwacja terminu to jedna wizyta (dzień + godzina). Wynajem to okres od–do, np. sprzęt lub nocleg; system liczy czynsz za cały okres i ewentualną kaucję. Cashback naliczamy od czynszu, bez kaucji." },
    { q: "Czy mogę zmienić lub odwołać termin?", a: "Tak, z poziomu Moich rezerwacji — sprzedawca widzi prośbę o zmianę i ją potwierdza. Zasady odwołań i zwrotów za rezerwacje określa oferta oraz regulamin." },
  ] },
  { id: "odbior", icon: "house", tint: "blue", title: "Odbiór osobisty", items: [
    { q: "Jak działa odbiór osobisty?", a: "Jeśli sprzedawca włączył punkt odbioru, w koszyku wybierzesz „Odbiór osobisty u sprzedawcy” (0 zł). Płacisz w aplikacji jak zwykle — z cashbackiem i Ochroną Kupujących. Gdy zamówienie będzie gotowe, dostaniesz powiadomienie z adresem i godzinami." },
    { q: "Co pokazać przy odbiorze?", a: "Numer zamówienia z zakładki Zamówienia. Sprzedawca oznacza „Przekazane klientowi”, a Ty możesz potwierdzić odbiór — wtedy sprzedawca dostaje wypłatę." },
  ] },
  { id: "sprzedaz", icon: "bag", tint: "amber", title: "Sprzedawanie w Sunrise Market", items: [
    { q: "Ile kosztuje sprzedawanie?", a: <>Pierwsze 12 miesięcy bez opłat. Potem <b>Sprzedawca</b> (bez NIP) płaci 299 zł / rok, a <b>Partner Handlowy</b> (firma z NIP) 499 zł / rok. Prowizja od sprzedaży: 7,9% przy płatności Sunrise Pay, 12,9% przy karcie/BLIK/P24. Szczegóły w <Link to="/cennik" style={{ color: "var(--gold)" }}>Cenniku</Link>.</> },
    { q: "Jak wystawić ogłoszenie?", a: <>Kliknij <Link to="/sprzedawca/wystaw" style={{ color: "var(--gold)" }}>Dodaj ogłoszenie</Link> i wybierz typ: produkt, usługa z terminarzem, wynajem, samochód lub nieruchomość. Kreator poprowadzi Cię przez zdjęcia, cenę, dostawę i szczegóły kategorii.</> },
    { q: "Kiedy dostanę pieniądze za sprzedaż?", a: "Po potwierdzeniu odbioru przez kupującego, doręczeniu przez kuriera albo automatycznie po 14 dniach (Ochrona Kupujących). Sprzedawca prywatny dostaje wypłatę na prywatny portfel Sunrise Pay, Partner Handlowy — na saldo firmowe." },
    { q: "Czy mogę odpowiadać na opinie?", a: <>Tak — w <Link to="/sprzedawca/opinie" style={{ color: "var(--gold)" }}>Centrum sprzedaży → Opinie</Link> odpowiadasz publicznie. Opinie wystawiają wyłącznie klienci po opłaconym zakupie; nie da się ich edytować ani usunąć.</> },
    { q: "Jak odpowiadać na wiadomości i pokazać numer telefonu?", a: <>Wiadomości od kupujących znajdziesz w <Link to="/wiadomosci" style={{ color: "var(--gold)" }}>Wiadomościach</Link> (także w Panelu Partnera). Numer telefonu włączysz w <Link to="/sprzedawca/odbior" style={{ color: "var(--gold)" }}>Centrum sprzedaży → Odbiór i kontakt</Link> — zobaczą go tylko zalogowani po kliknięciu „Pokaż numer”.</> },
    { q: "Co to Sunrise Verify?", a: "Dodatkowa weryfikacja danych pojazdu lub nieruchomości przed zakupem, zamawiana przy ofercie. Numer VIN nigdy nie jest publikowany w ogłoszeniu." },
  ] },
  { id: "konto", icon: "user", tint: "violet", title: "Konto, aplikacja i powiadomienia", items: [
    { q: "Jak się zalogować?", a: "Konto Sunrise Market jest wspólne z MySunrise — logujesz się tym samym e-mailem i hasłem. Rejestracja i reset hasła odbywają się w MySunrise, a po zalogowaniu wracasz na sunrisemarket.pl." },
    { q: "Jak zainstalować aplikację?", a: "Otwórz app.sunrisemarket.pl na telefonie. Android/Chrome zaproponuje instalację; na iPhonie w Safari wybierz Udostępnij → „Do ekranu początkowego”. Aplikacja działa w pełnym ekranie i wysyła powiadomienia o zamówieniach." },
    { q: "Jak włączyć powiadomienia push?", a: <>W <Link to="/konto" style={{ color: "var(--gold)" }}>Moje konto → Ustawienia</Link> włącz „Powiadomienia push”. Dostaniesz je przy zmianie statusu zamówienia, rezerwacji, spadku ceny obserwowanej oferty i nowej opinii.</> },
    { q: "Jak usunąć konto lub dane?", a: <>Napisz na <a href="mailto:kontakt@sunrisemarket.pl" style={{ color: "var(--gold)" }}>kontakt@sunrisemarket.pl</a>. Zasady przetwarzania danych opisuje <a href="/legal/prywatnosc.html" style={{ color: "var(--gold)" }}>Polityka prywatności</a>.</> },
  ] },
];

export default function Pomoc() {
  useSeo("Pomoc — Sunrise Market", "Najczęstsze pytania o zakupy, cashback 3%, Ochronę Kupujących, zwroty, rezerwacje, odbiór osobisty i sprzedawanie w Sunrise Market.", "/pomoc");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => { const t = q.trim().toLowerCase(); if (!t) return GROUPS; return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.q.toLowerCase().includes(t) || (typeof i.a === "string" && i.a.toLowerCase().includes(t))) })).filter((g) => g.items.length > 0); }, [q]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="text-[11px] font-semibold tracking-[.3em]" style={{ color: "var(--gold)" }}>POMOC</div>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight">Jak możemy pomóc?</h1>
      <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: "var(--mut)" }}>Odpowiedzi na najczęstsze pytania o zakupy, cashback, Ochronę Kupujących, rezerwacje i sprzedawanie. Nie znalazłeś swojego? Napisz do nas — odpowiadamy zwykle w ciągu jednego dnia roboczego.</p>
      <label className="mt-6 flex h-12 max-w-2xl items-center gap-2 rounded-xl px-4" style={CARD}><span style={{ color: "var(--mut)" }}><Ico name="search" size={20} /></span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj w pytaniach, np. zwrot, cashback, odbiór…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--ink)" }} aria-label="Szukaj w pomocy" /></label>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Tematy">{GROUPS.map((g) => <a key={g.id} href={`#${g.id}`} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium" style={CARD}><Ico name={g.icon} size={16} stroke="var(--gold)" />{g.title}</a>)}</nav>

      {total === 0 && <div className="mt-8 rounded-2xl p-6 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Brak pytań pasujących do „{q}”. Napisz do nas: <a href="mailto:kontakt@sunrisemarket.pl" style={{ color: "var(--gold)" }}>kontakt@sunrisemarket.pl</a>.</div>}
      {groups.map((g) => <section key={g.id} id={g.id} className="mt-10 scroll-mt-32">
        <div className="flex items-center gap-3"><IconTile name={g.icon} tint={g.tint} size={40} /><SectionTitle>{g.title}</SectionTitle></div>
        <div className="mt-4 grid gap-2">{g.items.map((it) => { const key = `${g.id}:${it.q}`; const on = open === key || !!q.trim(); return <div key={key} className="rounded-2xl" style={CARD}>
          <button type="button" onClick={() => setOpen(on && !q.trim() ? null : key)} aria-expanded={on} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-5 py-3 text-left font-semibold"><span>{it.q}</span><span aria-hidden="true" className="shrink-0 text-xl transition" style={{ color: "var(--gold)", transform: on ? "rotate(45deg)" : "none" }}>+</span></button>
          {on && <div className="px-5 pb-4 text-sm leading-6" style={{ color: "var(--mut)" }}>{it.a}</div>}
        </div>; })}</div>
      </section>)}

      <section className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl p-6" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.14),rgba(232,137,26,.03))", border: "1px solid rgba(245,166,35,.3)" }}>
        <div className="min-w-0 flex-1"><div className="font-bold">Nadal potrzebujesz pomocy?</div><div className="text-sm" style={{ color: "var(--mut)" }}>kontakt@sunrisemarket.pl · +48 728 105 424 · pon.–pt. 9:00–17:00</div></div>
        <a href="/legal/kontakt.html" className="flex h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Kontakt</a>
        <Link to="/o-nas" className="flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={CARD}>O nas</Link>
      </section>
    </div>
    <HomeFooter />
  </main>;
}
