# Do zrobienia ręcznie — Sunrise Market

Rzeczy, których nie da się zrobić z repozytorium ani z MCP, bo wymagają zalogowania
na konto właściciela. Każda pozycja ma dokładną ścieżkę, żeby nie szukać.

Stan na 2026-10-04.

---

## 1. Google Search Console — domena nie jest zweryfikowana (priorytet 1)

Dziś nikt nie wie, czy i co Google ma w indeksie, ile stron odrzucił i z jakimi
błędami. Sitemapa z 1344 adresami nie jest nigdzie zgłoszona.

1. https://search.google.com/search-console → **Dodaj zasób** → **Prefiks adresu
   URL** → `https://sunrisemarket.pl`.
2. Wybierz metodę **Tag HTML** i skopiuj wartość `content` z meta tagu.
3. Wklej ją w `index.html` jako
   `<meta name="google-site-verification" content="…">` i wypchnij na `main`.
   (Albo przekaż samą wartość — wstawienie to jedna linijka.)
4. Po weryfikacji: **Sitemapy** → dodaj `sitemap.xml`.
5. Sprawdź **Strony → Dlaczego strony nie są indeksowane** po tygodniu.

## 2. Bing Webmaster Tools

https://www.bing.com/webmasters → **Import from Google Search Console** (po punkcie 1
to jedno kliknięcie, przenosi weryfikację i sitemapy).

IndexNow **już działa i nie wymaga tego kroku** — klucz leży pod
`https://sunrisemarket.pl/4cf5c5682ec9e52e0ae8d10316a8013e.txt`, a `/api/indexnow`
zgłasza nowe ogłoszenia codziennie o 5:00. Pierwsze zgłoszenie 613 adresów przyjęte
2026-10-04 (HTTP 200). Panel Bing pokaże statystyki tych zgłoszeń.

## 3. Google Merchant Center — plik produktowy czeka

`https://sunrisemarket.pl/feed.xml` jest gotowy: 671 pozycji, 598 z numerem EAN,
bez danych kosztowych.

1. https://merchants.google.com → załóż konto dla sunrisemarket.pl.
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
