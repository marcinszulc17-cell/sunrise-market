# Makiety właściciela 2026-09-10 — co z nich bierzemy

Sześć makiet: Rezerwacje, karta produktu, wyniki wyszukiwania, Panel Partnera, karta nieruchomości, Ulubione.

**Wniosek nadrzędny: większość tego, co makiety pokazują, już mamy.** Zanim cokolwiek przerysujemy,
warto to wiedzieć — inaczej zapłacimy za redesign rzeczy, które działają.

## Już zrobione — nie budujemy drugi raz

| Element z makiety | Gdzie już jest |
|---|---|
| Okruszki (Strona główna › Kategoria › Oferta) | `SiteChrome.Breadcrumbs` — karta produktu, Ulubione |
| Boczne menu konta z podświetleniem sekcji | `SiteChrome.SideNav` |
| Pasek zaufania pod przyciskiem kupna | Karta produktu — „Ochrona kupującego / Zwrot 14 dni / Sunrise Pay / Cashback", treść zależna od trybu zakupu |
| Podobne ogłoszenia | `similarOffers()` na karcie produktu |
| Galeria zdjęć z przewijaniem | `SwipeGallery` |
| Kafle KPI w Panelu Partnera | `StatTile` — aktywne ogłoszenia, zamówienia, rezerwacje, wyświetlenia |
| Chipsy filtrów w wyszukiwarce | `AdvancedSearchUniversal` — tryb, kategorie, lokalizacja |
| Cashback na karcie oferty | `RecoCard` — „+X pkt" przy cenie |
| Spadek ceny na Ulubionych | `Obserwowane` — „↓ taniej o X" + sortowanie „Spadek ceny" |

Makieta Ulubionych jest pod tym względem **uboższa** od tego, co mamy: nie ma alertu cenowego,
czyli jedynego powodu, dla którego ktoś na tę stronę wraca.

## Wzięte od razu

- **Kolorowe plakietki kategorii na kartach ofert** (`categoryTint`) — Nieruchomości zielone,
  Motoryzacja niebieska, Usługi pomarańczowe, Rezerwacje/Bilety fioletowe, OZE bursztynowe;
  pozostałe zostają neutralne, bo 21 kategorii w 5 kolorach zamieniłoby siatkę w konfetti.

## Warte wzięcia — kolejność wg wartości

1. **Przełącznik siatka / lista w wynikach** — przy ofertach z ceną za m² albo przebiegiem lista
   niesie więcej informacji na ekran niż kafelki. Nie mamy tego wcale.
2. **Karta sprzedawcy na ofercie** — awatar (inicjały), „na Sunrise Market od …", ocena z liczbą opinii,
   „zobacz wszystkie ogłoszenia" → `/sprzedawcy/:id`. Dane mamy, brakuje samego widoku.
3. **Widełki cenowe jako gotowe chipsy** („do 200 zł", „200–500 zł", „powyżej 1000 zł") — dziś jest
   tylko pole od–do. Chipsy skracają drogę do wyniku o kilka sekund.
4. **Miniatury pod galerią z licznikiem „1/8"** — `SwipeGallery` ma przewijanie, nie ma podglądu
   wszystkich zdjęć naraz; przy 8–10 zdjęciach to robi różnicę.
5. **Ekran Rezerwacji z paskiem „dokąd / termin / liczba osób"** — kategoria `noclegi` istnieje,
   ale silnik rezerwacji obsługuje usługi z terminem i zadatkiem, nie doby hotelowe.
   To nie jest zadanie graficzne, tylko produktowe: albo dorabiamy typ „nocleg" (doba, liczba osób,
   cena za noc), albo ten ekran obiecuje coś, czego nie realizujemy.

## Odrzucone

- **„Ostatnio oglądane 28" i inne liczniki w koncie kupującego** — sprzeczne z decyzją właściciela
  z 2026-09-09 (§10): statystyki widzi tylko sprzedawca i operator. Do zmiany wyłącznie decyzją.
- **„Porady i artykuły" w pasku działów** — nie mamy takiej sekcji i nikt jej nie pisze.
  Martwa zakładka szkodzi bardziej niż jej brak.
- **Wypełniacz w danych** („1 523 ogłoszenia", pełne siatki po 8 kafli). Realnie mamy kilkaset ofert,
  w części kategorii zero. **Każdy ekran z makiety wymaga zaprojektowania stanu pustego i stanu
  „3 wyniki"** — bez tego wdrożenie skończy się pustymi półkami w ładnej witrynie.

## Do poprawienia w samych makietach

- Karta nieruchomości zawiera **„Na Sprzedajemy.pl od 2022"** — nazwa konkurencji została po źródle
  inspiracji. Do wycięcia, zanim makieta pójdzie dalej.
- Nazewnictwo się rozjeżdża: makieta mówi „Ulubione", kod „Obserwowane", adres `/obserwowane`;
  „Moje zakupy" vs `/zamowienia`. Jedno słowo w menu, nagłówku, adresie i powiadomieniach.
- Wszystkie makiety są desktopowe. Ruch w polskich marketplace'ach jest w większości mobilny.
