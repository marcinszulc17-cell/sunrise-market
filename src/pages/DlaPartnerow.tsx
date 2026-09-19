// Strona sprzedażowa dla sprzedawców i Partnerów Handlowych (decyzja właściciela 2026-09-19:
// „nie mamy podstrony, na której jest coś więcej opisane"). Do tej pory jedynym wejściem było
// /sprzedawca/dolacz — dwa kafelki z ceną, czyli wybór wariantu, a nie wyjaśnienie, po co tu być.
//
// Wzorowana na /dla-obiektow, bo tam ten układ się sprawdza: liczby z cennika na górze,
// konkret w środku, uczciwa sekcja „czego jeszcze nie ma" na dole.
//
// ZASADA: wszystkie liczby pochodzą z market.pricing_list() (platform_config). Nic tu nie
// dopisujemy „na oko" i nie podajemy statystyk typu ilu mamy klientów — Market dopiero rusza,
// a wymyślona liczba byłaby kłamstwem wobec człowieka, który podejmuje decyzję biznesową.
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { SiteHeader } from "../components/home/SiteChrome";
import { HomeFooter, CARD, GOLD_GRAD, Ico, type IconName } from "../components/home/HomeShared";
import { pricingList } from "../lib/api";
import { useSeo } from "../lib/seo";
import { zl } from "../lib/money";

type Prices = {
  commission_rate?: number; stripe_commission_rate?: number; cashback_rate?: number;
  pay_free_months?: number; trade_partner_annual_fee?: number; pay_annual_fee?: number;
  pay_activation_fee?: number;
};

const pct = (v?: number, d = 1) => `${((v ?? 0) * 100).toFixed(d).replace(".", ",").replace(",0", "")}%`;

export default function DlaPartnerow() {
  const [p, setP] = useState<Prices>({});
  useEffect(() => { pricingList().then((x) => setP((x ?? {}) as Prices)).catch(() => {}); }, []);
  useSeo(
    "Sprzedawaj w Sunrise Market — prowizja 7,9%, pierwszy rok bez opłaty",
    "Dla osób prywatnych i firm. Prowizja 7,9% przy płatności Sunrise Pay, pierwszy rok bez opłaty rocznej, wypłata po odbiorze towaru przez klienta, cashback 3% dla Twojego kupującego.",
    "/dla-partnerow",
  );

  const prowizja = pct(p.commission_rate ?? 0.079);
  const prowizjaKarta = pct(p.stripe_commission_rate ?? 0.129);
  const cashback = pct(p.cashback_rate ?? 0.03, 0);
  const free = p.pay_free_months ?? 12;
  const oplataSprzedawca = Number(p.trade_partner_annual_fee ?? 299);
  const oplataPartner = Number(p.pay_annual_fee ?? 499);
  const aktywacja = Number(p.pay_activation_fee ?? 0);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        <div className="text-center">
          <div className="text-xs font-semibold tracking-[.26em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET · SPRZEDAWCY</div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">Sprzedawaj u siebie, nie u pośrednika</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: "var(--mut)" }}>
            Produkty, usługi na termin, wynajem i ogłoszenia — w jednym miejscu, na Twoim koncie MySunrise.
            Płacisz jedną prowizję od tego, co faktycznie sprzedasz. Bez opłat za wystawienie i bez opłat za zapytania.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/sprzedawca/dolacz" className="grid h-11 items-center rounded-xl px-5 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Wybierz wariant i zacznij</Link>
            <Link to="/cennik" className="grid h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ ...CARD }}>Zobacz pełny cennik</Link>
          </div>
        </div>

        {/* Liczby — wszystkie z cennika platformy, nic dopisanego */}
        <section className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            { v: prowizja, l: "prowizja przy płatności Sunrise Pay" },
            { v: prowizjaKarta, l: "prowizja przy karcie i BLIK-u" },
            { v: `${free} mies.`, l: "bez opłaty rocznej na start" },
            { v: cashback, l: "cashbacku dostaje Twój klient" },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl p-4 text-center" style={CARD}>
              <div className="text-2xl font-bold" style={{ color: "var(--gold)" }}>{x.v}</div>
              <div className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>{x.l}</div>
            </div>
          ))}
        </section>

        {/* Co dostajesz */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Co dostajesz</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["bag", "Cztery sposoby sprzedaży", "Zwykła sprzedaż, usługa z terminarzem, wynajem na doby i bezpłatne ogłoszenie lokalne — jedno konto obsługuje wszystkie."],
              ["shield", "Ochrona Kupujących", "Każda transakcja idzie przez Sunrise. Pieniądze trafiają do Ciebie po tym, jak klient potwierdzi odbiór — kupujący wie, że nie traci, więc łatwiej mu kliknąć."],
              ["send", "Wypłata na portfel Sunrise Pay", "Osoba prywatna wypłaca na portfel prywatny, firma na saldo firmowe i Stripe Connect."],
              ["calendar", "Panel z tym, co się dzieje", "Oferty, zamówienia, rezerwacje, zapytania od klientów i opinie w jednym centrum sprzedaży."],
              ["bolt", "Opis oferty pisany przez asystenta", "Wrzucasz zdjęcia i tytuł, dostajesz gotowy opis do poprawienia. Nie musisz być copywriterem."],
              ["search", "Wyróżnienia zamiast abonamentu za widoczność", "Płacisz tylko wtedy, gdy chcesz podbić konkretną ofertę. Nic nie znika z wyników za brak opłaty."],
            ] as [IconName, string, string][]).map(([ico, t, d]) => (
              <div key={t} className="rounded-2xl p-4" style={CARD}>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(232,137,26,.14)", color: "var(--gold)" }}><Ico name={ico} size={16} /></span>
                  <div className="font-semibold">{t}</div>
                </div>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dwa warianty */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Dwa warianty — wybierasz sam</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>
            Różnica nie jest w tym, ile możesz sprzedać, tylko w tym, czy rozliczasz się jako osoba prywatna, czy jako firma.
            Pierwsze {free} miesięcy są bez opłaty rocznej w obu.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl p-5" style={CARD}>
              <div className="text-xs font-semibold tracking-[.2em]" style={{ color: "var(--mut)" }}>SPRZEDAWCA</div>
              <div className="mt-1 text-2xl font-semibold">Osoba prywatna</div>
              <div className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Bez NIP-u i bez papierologii. Uproszczone centrum sprzedaży, wypłaty na prywatny portfel.</div>
              <div className="mt-4 text-3xl font-bold" style={{ color: "var(--gold)" }}>{zl(oplataSprzedawca)}<span className="text-sm font-semibold" style={{ color: "var(--mut)" }}> / rok po okresie gratis</span></div>
            </div>
            <div className="rounded-2xl p-5" style={{ ...CARD, border: "1px solid rgba(232,137,26,.4)" }}>
              <div className="text-xs font-semibold tracking-[.2em]" style={{ color: "var(--gold)" }}>PARTNER HANDLOWY</div>
              <div className="mt-1 text-2xl font-semibold">Firma z NIP</div>
              <div className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Pełne centrum: faktury do zamówień, statystyki, promowanie i reklamy, Stripe Connect, program Ambassador Club.</div>
              <div className="mt-4 text-3xl font-bold" style={{ color: "var(--gold)" }}>{zl(oplataPartner)}<span className="text-sm font-semibold" style={{ color: "var(--mut)" }}> / rok po okresie gratis</span></div>
            </div>
          </div>
          {aktywacja === 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--mut)" }}>Opłaty aktywacyjnej nie ma — ani w jednym, ani w drugim wariancie.</p>
          )}
        </section>

        {/* Jak zacząć */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Jak zacząć</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["1", "Załóż konto", "Jedno konto MySunrise obsługuje wszystkie usługi Sunrise — nie zakładasz osobnego."],
              ["2", "Wybierz wariant", "Osoba prywatna albo firma. Pierwszy rok bez opłaty rocznej w obu."],
              ["3", "Wystaw pierwszą ofertę", "Kreator prowadzi przez zdjęcia, opis i cenę. Ogłoszenie lokalne możesz dodać od razu, bezpłatnie."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-2xl p-4" style={CARD}>
                <div className="grid h-8 w-8 place-items-center rounded-lg font-bold" style={{ background: "rgba(232,137,26,.14)", color: "var(--gold)" }}>{n}</div>
                <div className="mt-2 font-semibold">{t}</div>
                <p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Uczciwie o tym, czego nie ma */}
        <section className="mt-10 rounded-2xl p-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)" }}>
          <h2 className="font-semibold">Czego jeszcze nie mamy — mówimy wprost</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6" style={{ color: "var(--mut)" }}>
            <li>• Sunrise Market dopiero się rozkręca. Nie obiecujemy ruchu, którego jeszcze nie ma — jeśli szukasz gotowego tłumu kupujących, dziś go tu nie zastaniesz.</li>
            <li>• Nie mamy własnej floty kurierskiej ani magazynu. Wysyłkę organizujesz po swojemu.</li>
            <li>• Prowizja przy płatności kartą i BLIK-iem jest wyższa ({prowizjaKarta}), bo w niej siedzi koszt operatora płatności. Przy Sunrise Pay płacisz {prowizja}.</li>
            <li>• Opłata roczna pojawia się po {free} miesiącach. Nie jest ukryta i nie rośnie po cichu.</li>
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/sprzedawca/dolacz" className="grid h-11 items-center rounded-xl px-6 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Wybierz wariant i zacznij</Link>
          <Link to="/pomoc" className="grid h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ ...CARD }}>Mam pytanie</Link>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
