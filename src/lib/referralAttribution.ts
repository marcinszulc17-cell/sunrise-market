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

/* ─────────────────── LICZENIE KLIKNIĘĆ ───────────────────
 * `mme_ref_clicks` w MySunrise miało 117 kliknięć i ANI JEDNEGO ze źródłem
 * `sunrise_market`. Ambasador promujący Market widział w statystykach zero,
 * niezależnie od tego, ile osób kliknęło w jego link.
 *
 * DLACZEGO WPROST Z PRZEGLĄDARKI, A NIE PRZEZ MOST SERWEROWY.
 * `mme_log_ref_click` jest SECURITY DEFINER i czyta `request.headers`, żeby
 * ustalić user-agent, IP i kraj. Gdyby wołała ją funkcja brzegowa Marketu,
 * RPC zobaczyłaby nagłówki tej funkcji — pusty UA i IP centrum danych — i
 * oznaczyła KAŻDE kliknięcie z Marketu jako `is_suspect` z powodem „ruch spoza
 * PL". Statystyki byłyby gorsze niż ich brak. Wołanie z przeglądarki daje
 * prawdziwe nagłówki gościa; dokładnie tak robi to front MySunrise
 * (src/lib/referral.ts). `anon` ma prawo EXECUTE na tej funkcji.
 *
 * Bezpieczeństwo: RPC sama waliduje kod (musi istnieć), tnie po 300 kliknięć
 * na godzinę na kod, odsiewa duble w 15 s i wykrywa boty. Wstawia wyłącznie
 * wiersz do dziennika kliknięć — nic poza tym.
 */
const MS_URL = import.meta.env.VITE_MYSUNRISE_URL as string | undefined;
const MS_ANON = import.meta.env.VITE_MYSUNRISE_ANON_KEY as string | undefined;
/** Dławik lokalny: max 1 zgłoszenie na kod na godzinę z tej przeglądarki. */
const KLUCZ_KLIK = "sunrise_ref_click_log";
const DLAWIK_MS = 60 * 60 * 1000;

function czysty(v: string | null, max = 120): string | null {
  const t = (v || "").trim().slice(0, max);
  return t || null;
}

function zalogujKlikniecie(kod: string): void {
  if (!MS_URL || !MS_ANON) {
    // Głośno, bo cicha utrata statystyk polecenia to dokładnie ten błąd,
    // który ten moduł naprawia.
    console.warn("[polecenia] brak VITE_MYSUNRISE_URL / VITE_MYSUNRISE_ANON_KEY — kliknięcie nie zostanie policzone");
    return;
  }
  try {
    const teraz = Date.now();
    const raw = localStorage.getItem(KLUCZ_KLIK);
    const log: Record<string, number> = raw ? JSON.parse(raw) : {};
    if (teraz - Number(log[kod] || 0) < DLAWIK_MS) return;
    log[kod] = teraz;
    localStorage.setItem(KLUCZ_KLIK, JSON.stringify(log));
  } catch { /* prywatne okno — logujemy mimo wszystko, RPC ma własny dławik */ }

  const sp = new URLSearchParams(window.location.search);
  void fetch(`${MS_URL}/rest/v1/rpc/mme_log_ref_click`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: MS_ANON, Authorization: `Bearer ${MS_ANON}` },
    body: JSON.stringify({
      p_code: kod,
      p_module: "market",
      p_source: "sunrise_market",
      p_referrer: document.referrer || null,
      p_utm_source: czysty(sp.get("utm_source"), 60),
      p_utm_medium: czysty(sp.get("utm_medium"), 60),
      p_utm_campaign: czysty(sp.get("utm_campaign")),
      p_utm_content: czysty(sp.get("utm_content")),
      p_path: czysty(window.location.pathname),
    }),
    keepalive: true,
  })
    .then((r) => {
      // Odpowiedź sprawdzamy, bo cicha porażka to dokładnie ten błąd, który ten
      // moduł naprawia: łańcuch „wygląda, że działa", a w bazie zero wierszy.
      if (!r.ok) console.warn("[polecenia] kliknięcie nie zapisane:", r.status);
    })
    .catch(() => { /* statystyka nie może przeszkodzić w zakupach */ });
}

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
    if (kod) {
      const czysteKod = kod.trim().slice(0, 64);
      // Kliknięcie liczymy ZAWSZE, gdy link je niósł — także wtedy, gdy kod
      // polecającego jest już zapamiętany. Kliknięcie to zdarzenie marketingowe
      // (ktoś wszedł z linku), a nie zmiana atrybucji; zasada „pierwszy wygrywa"
      // dotyczy wyłącznie tej drugiej.
      if (POPRAWNY_KOD.test(czysteKod)) zalogujKlikniecie(czysteKod);
      if (!zapamietanyKod()) {
        localStorage.setItem(KLUCZ, czysteKod);
        // Nowy kod = nowa szansa na przypisanie, nawet jeśli poprzednia próba padła.
        localStorage.removeItem(KLUCZ_PROBA);
      }
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
