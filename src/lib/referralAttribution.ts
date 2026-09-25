// src/lib/referralAttribution.ts
//
// KOD POLECAJĄCY Z LINKU → PRZYPISANIE DO AMBASADORA.
//
// CO BYŁO ZEPSUTE
// Link `?ref=KOD` (i krótka postać `/r/KOD`) był poprawnie odczytywany i zapisywany
// do `localStorage` pod kluczem `sunrise_ref`. Na tym łańcuch się kończył. Funkcja
// `refAttribute()` w src/lib/api.ts istniała, funkcja brzegowa `ref-attribute`
// była wdrożona, most `mkt-referral` po stronie MySunrise działał — ale NIKT nigdy
// nie wywoływał pierwszego ogniwa. Stąd w bazie zero poleceń ze źródłem
// `sunrise_market` przy 117 zarejestrowanych kliknięciach z innych kanałów.
//
// DLACZEGO TO MUSI SIĘ DZIAĆ JAK NAJWCZEŚNIEJ
// `mkt_referral_attribute` odpuszcza (`already: true`), gdy klient MA JUŻ
// jakiekolwiek przypisanie w `mme_referrals`. A wyzwalacz rejestracji
// `handle_unassigned_client` podpina każde nowe konto BEZ kodu pod korzeń
// struktury ze źródłem `unassigned` — natychmiast, w momencie zakładania konta.
// Spóźnione przypisanie nie ma więc czego nadpisać i przepada po cichu.
//
// Stąd dwie drogi, obie potrzebne:
//   1. REJESTRACJA — kod jedzie w adresie do `/dolacz?ref=KOD` na MySunrise i ląduje
//      w `raw_user_meta_data.ref_code`. Wyzwalacz widzi niepusty `ref_code` i NIE
//      podpina konta pod korzeń. To jedyna droga, która działa dla nowych kont.
//      Buduje ją `registerUrl()` w src/pages/Login.tsx.
//   2. ISTNIEJĄCE KONTO — klient kliknął link polecający, a konto ma już od dawna.
//      Wtedy przypisanie robi ten moduł, przy pierwszym zalogowanym renderze.
//
// Kod kasujemy dopiero po ROZSTRZYGNIĘCIU (przypisano / już przypisany / zły kod).
// Błąd sieci zostawia kod na miejscu, żeby kolejne wejście spróbowało ponownie.

import { supabase } from "./supabase";
import { refAttribute } from "./api";

const KLUCZ = "sunrise_ref";
/** Znacznik „dla tego kodu już próbowaliśmy" — chroni przed pętlą przy każdym renderze. */
const KLUCZ_PROBA = "sunrise_ref_attempt";

const POPRAWNY_KOD = /^[A-Za-z0-9_-]{4,64}$/;

export function zapamietanyKod(): string | null {
  try {
    const raw = localStorage.getItem(KLUCZ)?.trim() || "";
    return POPRAWNY_KOD.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function zapomnijKod(): void {
  try {
    localStorage.removeItem(KLUCZ);
    localStorage.removeItem(KLUCZ_PROBA);
  } catch { /* prywatne okno */ }
}

/**
 * Odczyt kodu z bieżącego adresu: `?ref=KOD` albo `/r/KOD`.
 * Pierwszy kod wygrywa — kolejny link nie podmienia wcześniejszego polecającego.
 * Zwraca true, gdy adres niósł krótką postać `/r/KOD` (wtedy wołający ją sprząta).
 */
export function zapamietajKodZAdresu(): boolean {
  try {
    const zZapytania = new URLSearchParams(window.location.search).get("ref");
    const zSciezki = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]{4,64})\/?$/);
    const kod = (zZapytania && zZapytania.trim()) || (zSciezki && zSciezki[1]) || "";
    if (kod && !zapamietanyKod()) {
      localStorage.setItem(KLUCZ, kod.trim().slice(0, 64));
      // Nowy kod = nowa szansa na przypisanie, nawet jeśli poprzednia próba padła.
      localStorage.removeItem(KLUCZ_PROBA);
    }
    return Boolean(zSciezki);
  } catch {
    return false;
  }
}

/**
 * Spróbuj przypisać zalogowanego klienta do ambasadora. Bez sesji albo bez kodu
 * nic nie robi. Cicha — polecenie nie może przerwać ani spowolnić zakupów.
 */
export async function przypiszPolecenie(): Promise<void> {
  const kod = zapamietanyKod();
  if (!kod) return;

  try {
    if (localStorage.getItem(KLUCZ_PROBA) === kod) return;
  } catch { /* brak localStorage — próbujemy raz na załadowanie strony */ }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    localStorage.setItem(KLUCZ_PROBA, kod);
  } catch { /* ignore */ }

  try {
    const wynik = (await refAttribute(kod)) as { ok?: boolean; already?: boolean; reason?: string } | null;
    if (!wynik) return;

    // Rozstrzygnięcia końcowe — kod zrobił swoje albo nigdy nie zadziała.
    // `no_user` NIE jest końcowe: konto może jeszcze powstać (rejestracja w toku).
    const koniec =
      wynik.ok === true ||
      wynik.reason === "no_ambassador" ||
      wynik.reason === "self" ||
      wynik.reason === "no_code";
    if (koniec) zapomnijKod();
  } catch {
    // Błąd sieci: zostawiamy kod i znacznik zdejmujemy, żeby spróbować przy
    // następnym wejściu. Inaczej jedno zerwane połączenie kosztowałoby prowizję.
    try { localStorage.removeItem(KLUCZ_PROBA); } catch { /* ignore */ }
  }
}

/**
 * Wpięcie w cykl życia aplikacji: próbujemy przy starcie (gdy sesja już jest)
 * i po każdym zalogowaniu — w tym po powrocie z SSO z MySunrise, którym wraca
 * klient prosto po rejestracji.
 */
export function startReferralAttribution(): void {
  void przypiszPolecenie();
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      void przypiszPolecenie();
    }
    if (event === "SIGNED_OUT") {
      // Kod polecający należy do przeglądarki, nie do sesji — ale znacznik próby
      // musi zniknąć, żeby następny zalogowany dostał własną szansę.
      try { localStorage.removeItem(KLUCZ_PROBA); } catch { /* ignore */ }
    }
  });
}
