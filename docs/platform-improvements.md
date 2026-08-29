# Sunrise Market — roadmap usprawnień

## Priorytet 0 — bezpieczeństwo i integralność
- Włączyć RLS z politykami dla tabel dostępnych z klienta; nie włączać globalnie bez przygotowanych polityk.
- Zamknąć bezpośredni dostęp do danych wrażliwych i operacyjnych; publiczne dane wystawiać przez bezpieczne RPC.
- Przenieść VIN, numer rejestracyjny, numer KW i inne dane wrażliwe poza `offers.attributes`.
- Dodać rate limiting/CAPTCHA do anonimowych leadów.
- Ustalić retencję i usuwanie PII leadów.

## Priorytet 1 — konwersja
- Jedno CTA główne na karcie oferty zależne od typu: kup / zapytaj / umów oględziny.
- Obserwowanie oferty + alert obniżki ceny.
- Porównywarka aut i nieruchomości.
- Sekcja wiarygodności sprzedawcy: KYC, liczba sprzedaży, czas odpowiedzi, opinie.
- Kompletność ogłoszenia i podpowiedzi brakujących pól.

## Priorytet 2 — Sunrise Verify
- Raport pojazdu: płatność, kolejka, provider adapter, raport i archiwum w koncie.
- Nieruchomości: analiza dokumentów użytkownika / KW bez scrapowania systemów urzędowych.
- Panel operatora z ręcznym dokończeniem zlecenia jako fallback.
- Powiadomienie e-mail/push po gotowym raporcie.

## Priorytet 3 — sprzedawca
- Inbox leadów z SLA i przypomnieniami.
- Rezerwacja terminu oględzin.
- Szablony odpowiedzi i generowanie opisów.
- Statystyki: wyświetlenia → leady → sprzedaż, koszt promocji, ROI.
- Masowe edycje i automatyczne odnawianie ofert.

## Priorytet 4 — jakość katalogu i wyszukiwania
- Ujednolicić aliasy pól (`mileage`/`mileage_km`, `power`/`power_hp`, `engine`/`engine_cc`).
- Walidować parametry po kategorii przed publikacją.
- Geolokalizacja i promień wyszukiwania.
- Ranking trafności uwzględniający jakość ogłoszenia, świeżość i wiarygodność sprzedawcy.
- Dedykowane filtry dla aut, nieruchomości i usług.

## Priorytet 5 — monetyzacja
- Promowanie ofert: wyróżnienie, top kategorii, strona główna, CPC/flat-day.
- Pakiety sprzedawców i limity darmowych ogłoszeń.
- Sunrise Verify jako usługa dodatkowa.
- Opcjonalne prowizje Ambassador Club tylko dla zatwierdzonych ofert/sprzedawców.
