import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../components/home/SiteChrome";
import { supabase } from "../lib/supabase";

const CARD: React.CSSProperties = { background: "var(--glass)", border: "1px solid var(--line)" };

type Pozycja = {
  tytul: string;
  opis: string;
  href: string;
  meta: string;
  zewnetrzny?: boolean;
};

const DLA_WSZYSTKICH: Pozycja[] = [
  {
    tytul: "Kalkulator prowizji dla obiektów noclegowych",
    opis:
      "Właściciel wpisuje swoją cenę za dobę, obłożenie i prowizję, jaką płaci dziś — i widzi różnicę na własnych liczbach. Można zostawić zgłoszenie ze zgodą na kontakt.",
    href: "/dla-obiektow/kalkulator.html",
    meta: "Strona · otwiera się w przeglądarce",
    zewnetrzny: true,
  },
  {
    tytul: "Warunki i cennik Sunrise Market",
    opis:
      "Prowizje, abonamenty, cashback i zasady wypłat — wszystko w jednym miejscu, do pokazania sprzedawcy przy rozmowie.",
    href: "/cennik",
    meta: "Strona",
  },
];

const DLA_AMBASADOROW: Pozycja[] = [
  {
    tytul: "Fotowoltaika i magazyny energii",
    opis:
      "Główna baza prowizyjna — 65 pozycji w katalogu, ile z nich zostaje, kogo szukać i jak prowadzić rozmowę o rachunku za prąd.",
    href: "/materialy/ambasador-oze.pdf",
    meta: "PDF · 2 strony",
    zewnetrzny: true,
  },
  {
    tytul: "Serwis i Protect Plus",
    opis:
      "Prowizja, która wraca co roku — przeglądy okresowe i programy ochrony. 25 pozycji z cenami i kiedy je sprzedawać.",
    href: "/materialy/ambasador-serwis.pdf",
    meta: "PDF · 2 strony",
    zewnetrzny: true,
  },
  {
    tytul: "Pozyskiwanie sprzedawców Market",
    opis:
      "Prowizja z subskrypcji — ile jest warta i od kiedy, co realnie dostaje sprzedawca i dlaczego pierwszy rok to zero.",
    href: "/materialy/ambasador-sprzedawcy.pdf",
    meta: "PDF · 2 strony",
    zewnetrzny: true,
  },
  {
    tytul: "Obiekty noclegowe",
    opis:
      "Na czym ambasador w tym kanale naprawdę zarabia, co mówić właścicielowi obiektu i czego nie obiecywać.",
    href: "/materialy/ambasador-obiekty-noclegowe.pdf",
    meta: "PDF · 2 strony",
    zewnetrzny: true,
  },
];

export default function Materialy() {
  const [zalogowany, setZalogowany] = useState<boolean | null>(null);

  useEffect(() => {
    let anulowane = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!anulowane) setZalogowany(Boolean(data.user));
      })
      .catch(() => {
        if (!anulowane) setZalogowany(false);
      });
    return () => {
      anulowane = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader compact />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl font-semibold">Materiały do pobrania</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--mut)" }}>
          Wszystko, co przydaje się w rozmowie o Sunrise Market — dla sprzedawców, właścicieli obiektów
          noclegowych i ambasadorów. Liczby w materiałach są zgodne z obowiązującym cennikiem.
        </p>

        <Sekcja tytul="Dla wszystkich" pozycje={DLA_WSZYSTKICH} />

        <section className="mt-9">
          <h2 className="text-lg font-semibold">Dla ambasadorów</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>
            Kartki sprzedażowe, jedna na kanał — zawierają zasady prowizyjne programu, więc nie
            pokazujemy ich klientom. Każda mieści się na dwóch stronach i jest do wydruku.
          </p>

          {zalogowany === null && (
            <div className="mt-3 rounded-2xl p-5 text-sm" style={{ ...CARD, color: "var(--mut)" }}>
              Sprawdzam dostęp…
            </div>
          )}

          {zalogowany === false && (
            <div className="mt-3 rounded-2xl p-5" style={CARD}>
              <p className="text-sm leading-6" style={{ color: "var(--mut)" }}>
                Te materiały są dostępne po zalogowaniu na konto Sunrise.
              </p>
              <Link
                to={`/login?next=${encodeURIComponent("/materialy")}`}
                className="mt-3 inline-grid h-11 items-center rounded-xl px-5 text-sm font-bold"
                style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                Zaloguj się
              </Link>
            </div>
          )}

          {zalogowany === true && (
            <>
              <Lista pozycje={DLA_AMBASADOROW} />
              <div className="mt-3 rounded-2xl p-5" style={CARD}>
                <div className="text-xs font-bold" style={{ color: "var(--gold)" }}>
                  ZIP · 4 kartki · 320 kB
                </div>
                <div className="mt-1 font-semibold">Pobierz komplet</div>
                <p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>
                  Wszystkie cztery kartki w jednym pliku, razem z krótką instrukcją — do przesłania
                  dalej albo do wydrukowania na raz.
                </p>
                <a
                  href="/materialy/kartki-ambasadora.zip"
                  className="mt-3 inline-grid h-11 items-center rounded-xl px-5 text-sm font-bold"
                  style={{ background: "var(--gold)", color: "#161219" }}
                >
                  Pobierz paczkę (ZIP)
                </a>
              </div>
            </>
          )}
        </section>

        <p className="mt-10 text-xs leading-6" style={{ color: "var(--mut)" }}>
          Materiałów nie wysyłamy na zimno do osób, które o to nie prosiły — art. 10 ustawy o świadczeniu usług
          drogą elektroniczną wymaga uprzedniej zgody, także wobec firm.
        </p>
      </main>
    </div>
  );
}

function Sekcja({ tytul, pozycje }: { tytul: string; pozycje: Pozycja[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{tytul}</h2>
      <Lista pozycje={pozycje} />
    </section>
  );
}

function Lista({ pozycje }: { pozycje: Pozycja[] }) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {pozycje.map((p) => (
        <li key={p.href} className="rounded-2xl p-5" style={CARD}>
          <div className="text-xs font-bold" style={{ color: "var(--gold)" }}>
            {p.meta}
          </div>
          <div className="mt-1 font-semibold">{p.tytul}</div>
          <p className="mt-1 text-sm leading-6" style={{ color: "var(--mut)" }}>
            {p.opis}
          </p>
          {p.zewnetrzny ? (
            <a
              href={p.href}
              className="mt-3 inline-block text-sm font-semibold underline"
              style={{ color: "var(--gold)" }}
            >
              Otwórz →
            </a>
          ) : (
            <Link to={p.href} className="mt-3 inline-block text-sm font-semibold underline" style={{ color: "var(--gold)" }}>
              Otwórz →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
