// Black Weekend 27–30.11.2026 (decyzja właściciela 27.11.2026): wyskakujące okienko dla klientów Marketu.
// Filtr wody SW200 RO z montażem gratis przy umowie Sunrise Energy na magazyn energii, fotowoltaikę albo pompę ciepła.
// Pokazuje się raz dziennie na urządzeniu, tylko na stronach klienta i tylko w trakcie akcji — potem znika samo.
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

const OD = Date.parse("2026-11-26T23:00:00Z"); // 27.11.2026 00:00 Europe/Warsaw
const DO = Date.parse("2026-11-30T23:00:00Z"); // po 30.11.2026 23:59 Europe/Warsaw
const KLUCZ = "sm:black-weekend-2026";
const FORMULARZ = "https://mysunrise.pl/analiza?k=market&t=magazyn&utm_source=sunrisemarket&utm_campaign=black-weekend";

export function trwaBlackWeekend(teraz = Date.now()): boolean {
  return teraz >= OD && teraz < DO;
}

function dzisiaj(): string {
  return new Date().toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
}

function juzPokazanoDzis(): boolean {
  try { return localStorage.getItem(KLUCZ) === dzisiaj(); } catch { return false; }
}

function zapamietaj(): void {
  try { localStorage.setItem(KLUCZ, dzisiaj()); } catch { /* brak pamięci — pokaże się ponownie, trudno */ }
}

// Nie przeszkadzamy przy logowaniu, płatności, w panelu sprzedawcy i operatora.
const BEZ_OKIENKA = /^\/(sprzedawca|operator|koszyk|verify|potwierdz-zakup|login|sso|odbior)/;

export default function BlackWeekendPopup() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [otwarte, setOtwarte] = React.useState(false);

  React.useEffect(() => {
    if (!trwaBlackWeekend() || BEZ_OKIENKA.test(pathname) || juzPokazanoDzis()) return;
    const t = window.setTimeout(() => setOtwarte(true), 1500);
    return () => window.clearTimeout(t);
  }, [pathname]);

  React.useEffect(() => {
    if (!otwarte) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") zamknij(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [otwarte]);

  function zamknij() { zapamietaj(); setOtwarte(false); }

  if (!otwarte) return null;
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="bw-tytul"
      onClick={zamknij}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(5,8,18,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, background: "#0b0f19", color: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.5)", border: "1px solid rgba(244,103,23,.5)" }}
      >
        <div style={{ position: "relative" }}>
          <img src="/black-weekend.jpg" alt="Black Weekend: filtr wody SW200 RO z montażem gratis" style={{ width: "100%", height: "auto", display: "block" }} />
          <button
            onClick={zamknij} aria-label="Zamknij"
            style={{ position: "absolute", top: 8, right: 8, width: 44, height: 44, borderRadius: 22, border: 0, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 22, cursor: "pointer" }}
          >×</button>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          <h2 id="bw-tytul" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            Black Weekend do poniedziałku 30.11
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "#d7deea" }}>
            Podpisz do 30.11.2026 umowę z Sunrise Energy na <b style={{ color: "#fff" }}>magazyn energii, fotowoltaikę albo pompę ciepła</b>,
            a w prezencie dostaniesz <b style={{ color: "#f46717" }}>filtr wody SW200 RO z montażem</b> (wartość 5 290 zł).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <a
              href={FORMULARZ} onClick={zapamietaj}
              style={{ flex: "1 1 220px", textAlign: "center", padding: "13px 16px", borderRadius: 12, background: "#f46717", color: "#fff", fontWeight: 700, textDecoration: "none" }}
            >Sprawdź, ile dostaniesz — oddzwonimy</a>
            <button
              onClick={() => { zamknij(); navigate("/szukaj?kat=oze-i-energia"); }}
              style={{ flex: "1 1 180px", padding: "13px 16px", borderRadius: 12, background: "transparent", color: "#fff", fontWeight: 600, border: "1px solid rgba(255,255,255,.35)", cursor: "pointer" }}
            >Zobacz oferty OZE</button>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#9aa6ba" }}>
            Prezent przy umowie podpisanej do 30.11.2026. Wymiana wkładów w filtrze płatna osobno.
          </p>
        </div>
      </div>
    </div>
  );
}
