# Do zrobienia ręcznie — Sunrise Market

Rzeczy, których nie da się zrobić z repozytorium ani z MCP, bo wymagają zalogowania
na konto właściciela. Każda pozycja ma dokładną ścieżkę, żeby nie szukać.

Stan na 2026-10-04, po wejściu do Search Console i sprawdzeniu faktów.

---

## 1. Search Console — ZROBIONE, byłem w błędzie

Domena **jest zweryfikowana od sierpnia** jako zasób domenowy (`sc-domain:sunrisemarket.pl`,
weryfikacja przez DNS) i **sitemapa jest zgłoszona** — 12 sierpnia, ostatni odczyt
2 października, stan „Sukces", 1344 wykryte strony. Wcześniejsza wersja tego pliku
twierdziła inaczej, bo wnioskowała z braku tagu `google-site-verification` w kodzie —
a zasób domenowy takiego tagu nie używa. Żaden kod weryfikacyjny nie jest potrzebny.

**Prawdziwy stan indeksacji (dane GSC z 21.09.2026):**

| | |
|---|---|
| W indeksie | **52** |
| Poza indeksem | **776** |
| → „wykryta, obecnie niezindeksowana" | 767 |
| → zeskanowana, jeszcze niezindeksowana | 5 |
| → alternatywna z canonicalem / noindex / przekierowanie | 4 |
| Kliknięcia z wyszukiwarki (3 miesiące) | 8 |

To nie jest usterka techniczna — Google zna te adresy z sitemapy i świadomie ich
nie indeksuje. Inspektor adresu dla `/miasto` pokazał dlaczego: **„Strona odsyłająca:
nie wykryto"**. Strona główna oddawała robotom pusty `<div id="root">`, więc graf
linków całego serwisu zaczynał się od zera. Naprawione 2026-10-04 (`api/start.ts`
plus `middleware.ts`) — strona główna ma teraz 150 linków w surowym HTML, w tym
60 ogłoszeń i 78 miast.

**Czego się po tym spodziewać:** odbudowa indeksu to tygodnie, nie dni, i sam
HTML nie wystarczy. 767 niezindeksowanych pozycji to w większości ogłoszenia
hurtowe o opisach zbliżonych do setek innych sklepów. Dwie dźwignie, których
nie da się zrobić kodem: **unikalne opisy** przy pozycjach, na których nam zależy,
oraz **linki z zewnątrz** — domena nie ma dziś praktycznie żadnych.

## 2. Bing Webmaster Tools

https://www.bing.com/webmasters → **Import from Google Search Console** (jedno
kliknięcie, przenosi weryfikację i sitemapy).

IndexNow **już działa i nie wymaga tego kroku** — klucz leży pod
`https://sunrisemarket.pl/4cf5c5682ec9e52e0ae8d10316a8013e.txt`, a `/api/indexnow`
zgłasza nowe ogłoszenia codziennie o 5:00. Pierwsze zgłoszenie 613 adresów przyjęte
2026-10-04 (HTTP 200). Panel Bing pokaże statystyki tych zgłoszeń.

## 3. Google Merchant Center — plik produktowy czeka

`https://sunrisemarket.pl/feed.xml` jest gotowy: 671 pozycji, 598 z numerem EAN,
bez danych kosztowych.

Google **sam wykrył 381 produktów** na sunrisemarket.pl i proponuje start w Search
Console (Zakupy → Możliwości dla sprzedawców → „Rozpocznij"). Konta nie zakładam
w Twoim imieniu — wymaga akceptacji regulaminu Google.

1. https://merchants.google.com albo przycisk „Rozpocznij" w Search Console.
2. **Produkty → Źródła danych → Dodaj źródło danych → Zaplanowane pobieranie**.
3. Adres: `https://sunrisemarket.pl/feed.xml`, kraj: Polska, waluta: PLN,
   częstotliwość: codziennie.
4. Włącz **bezpłatne listy produktowe** (Free listings) — nie wymagają budżetu
   reklamowego.
5. Konto wymaga potwierdzenia witryny (ten sam mechanizm co Search Console)
   oraz uzupełnienia danych o wysyłce i zwrotach w ustawieniach konta.

**Dostawa jest już w pliku** — stawki lecą z `market.shipping_methods` przy każdym
wygenerowaniu (Paczkomat InPost 15,99, kurierzy DPD/InPost 17,99, strefa PL).
Jak zmienisz je w bazie, plik pójdzie za nimi.

**Zwrotów w pliku nie ma i być nie może** — Google wiąże je z polityką zdefiniowaną
w samym Merchant Center (`return_policy_label` tylko na nią wskazuje). Przy zakładaniu
konta wpisz to, co stoi w regulaminie §8 i w `/legal/zwroty.html`:
**14 dni na odstąpienie** przy zakupie od przedsiębiorcy, **koszt odesłania po stronie
kupującego**, chyba że zwrot wynika z wady lub naszego błędu — wtedy pokrywamy go my.

## 4. Supabase Auth — ochrona przed wyciekłymi hasłami jest wyłączona

https://supabase.com/dashboard/project/ihehncaaokbwbdqdztna/auth/providers
→ **Email** → **Password Security** → włącz
**„Prevent use of leaked passwords"** (sprawdzanie przy HaveIBeenPwned).

Jedno kliknięcie. Nie robimy tego z kodu, bo to zmiana w uwierzytelnianiu
produkcyjnym.

## 5. Analityka — jej po prostu nie ma

Ani GA4, ani Plausible, ani Vercel Analytics. Bez tego nie da się stwierdzić,
czy cokolwiek z powyższego przyniosło ruch. Decyzja należy do właściciela, bo
dotyka zgód na cookies:

- **Vercel Web Analytics** — bez ciasteczek, bez banera zgody, włącza się
  w panelu projektu i dokłada jedną paczkę npm. Najmniejszy koszt prawny.
- **GA4** — więcej danych, ale wymaga banera zgody i wpisu w polityce prywatności.

## 6. Mapy — klucz zamiast kafelków OpenStreetMap (MillionPlaces)

`millionplaces.online` korzysta teraz z kafelków OSM, bo CARTO przeszło na klucze
API. Polityka OSM nie przewiduje ruchu komercyjnego na ich serwerach, więc
docelowo warto wziąć darmowy klucz CARTO albo MapTiler i wrócić na ciemną mapę
bez filtru CSS.

---

## Sprzątanie (bez pośpiechu)

- Pięć tabel `public.ebookly_*` — zero wierszy, z innego produktu. Uprawnienia
  `anon`/`authenticated` odebrane 2026-10-04; same tabele zostają do decyzji.
- Rozszerzenie `pg_net` siedzi w schemacie `public`. Przeniesienie zepsułoby
  wywołania `net.http_post`, więc wymaga przejścia po wszystkich użyciach.
- Funkcje brzegowe `tmp-image-hash-20260923`, `tmp-lamp-media-upload-20260924`,
  `tmp-lamp-hash-20260924`, `admin-once-media-upload` zwracają 410, ale nadal
  są wdrożone. Do skasowania w panelu Supabase.
