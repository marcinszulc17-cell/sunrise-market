// „Żywy” Sunny w Market (zgłoszenie właściciela 20.11.2026: „dobrze gdyby on był żywy, tak jak pies InPostu”).
// Czysta logika bez Reacta: co Sunny mówi w dymku i kiedy. Wygląd postaci się nie zmienia — używamy wyłącznie
// grafik właściciela z public/sunny/* (sylwetka wskazująca + poza „macha”), ruch robi CSS.

export type SunnyPoza = "stoi" | "macha" | "skacze";
export type SunnyDymek = { klucz: string; tekst: string; poza: SunnyPoza };

// Ile ms dymek wisi, zanim zniknie sam. Dłużej nie — ma zaczepiać, a nie zasłaniać ofertę.
export const DYMEK_MS = 5200;
// Po ilu ms od wejścia na stronę Sunny się odzywa (nie od razu — najpierw człowiek ma się rozejrzeć).
export const ZACZEPKA_MS = 9000;

// Dymek kontekstowy dla danej ścieżki. Każdy klucz pokazujemy najwyżej raz na sesję przeglądarki,
// żeby Sunny nie gadał przy każdym kliknięciu.
export function dymekDlaStrony(sciezka: string): SunnyDymek {
  const p = (sciezka || "/").toLowerCase();
  if (p.startsWith("/produkt") || p.startsWith("/oferta")) return { klucz: "produkt", tekst: "Masz pytanie o tę ofertę? Kliknij mnie 👋", poza: "macha" };
  if (p.startsWith("/szukaj") || p.startsWith("/sklep")) return { klucz: "szukaj", tekst: "Nie możesz czegoś znaleźć? Napisz mi, czego szukasz.", poza: "stoi" };
  if (p.startsWith("/noclegi") || p.startsWith("/rezerwacje")) return { klucz: "rezerwacje", tekst: "Pomogę dobrać termin i ofertę 📅", poza: "macha" };
  if (p.startsWith("/obserwowane")) return { klucz: "ulubione", tekst: "Fajne wybory! Mogę podpowiedzieć coś podobnego.", poza: "macha" };
  return { klucz: "start", tekst: "Cześć, jestem Sunny! W czym pomóc? ☀️", poza: "macha" };
}

// Reakcja na dodanie do koszyka — zawsze, bez limitu na sesję (to jest nagroda za akcję klienta).
export function dymekKoszyk(tytul?: string): SunnyDymek {
  const t = (tytul || "").trim();
  const krotki = t.length > 34 ? `${t.slice(0, 32).trimEnd()}…` : t;
  return { klucz: "koszyk", tekst: krotki ? `Super wybór! „${krotki}” jest w koszyku 🛒` : "Super wybór! Dodane do koszyka 🛒", poza: "skacze" };
}

// Pamięć „już mówiłem” w sessionStorage. Brak dostępu (tryb prywatny, blokada) = traktujemy jak „już mówił”,
// żeby w razie wątpliwości raczej milczał, niż powtarzał się w kółko.
const KLUCZ_SESJI = "sunny_powiedzial";
export function juzPowiedzial(klucz: string, magazyn?: Pick<Storage, "getItem"> | null): boolean {
  try { const s = magazyn ?? globalThis.sessionStorage; return (s?.getItem(KLUCZ_SESJI) || "").split(",").includes(klucz); } catch { return true; }
}
export function zapamietaj(klucz: string, magazyn?: Pick<Storage, "getItem" | "setItem"> | null): void {
  try {
    const s = magazyn ?? globalThis.sessionStorage; if (!s) return;
    const byly = (s.getItem(KLUCZ_SESJI) || "").split(",").filter(Boolean);
    if (!byly.includes(klucz)) s.setItem(KLUCZ_SESJI, [...byly, klucz].join(","));
  } catch { /* bez pamięci — trudno */ }
}

// Zdarzenie, które wysyła koszyk po udanym dodaniu (src/lib/cart.ts → addToCart).
export const ZDARZENIE_KOSZYK = "sunrise:cart-added";
