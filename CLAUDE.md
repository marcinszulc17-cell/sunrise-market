# Sunrise — reguły projektu (twarde inwarianty)

Te zasady obowiązują we WSZYSTKICH projektach ekosystemu Sunrise i mają
pierwszeństwo przy każdej zmianie kodu. Nie wolno ich naruszać ani obchodzić.

## 1. Płatności: portfel promowany + karta do wyboru (decyzja właściciela 2026-08-11, cashback dla wszystkich metod 2026-09-05)

- **Zakupy jednorazowe**: portfel Sunrise Pay jest metodą **promowaną**
  (główny przycisk) + do wyboru **karta przez Stripe** (drugi przycisk; P24/BLIK nie są włączone — sesje Stripe bez `payment_method_types`, metody wg ustawień w Dashboardzie Stripe; w UI piszemy „Karta (Stripe)”, decyzja właściciela 2026-09-06).
- **Cashback 3% przy KAŻDEJ metodzie płatności** — portfel, karta,
  subskrypcje i ich odnowienia (decyzja właściciela 2026-09-05; wcześniej tylko portfel).
- **Subskrypcje**: rozliczane **wyłącznie przez Stripe** (cashback za każdy opłacony miesiąc).
- Płatność kartą: edge `checkout` z `payment_method='card'` tworzy sesję
  Stripe Checkout; `stripe-webhook` po opłacie ustawia `paid`, nalicza wypłaty
  sprzedawcom (te same stawki), prowizję MLM marki własnej i **cashback** (`pay-credit-points`).
- Portfel: checkout woła `pay-charge`; brak środków → `need_topup`, UI proponuje
  punkty/doładowanie w koszyku, a poniżej alternatywę kartą.
- Integracje fulfillmentu (np. most TeemDrop → WooCommerce) **nie pobierają
  płatności od klienta** — zamówienie w systemie zewnętrznym jest tylko
  sygnałem realizacji (`set_paid: true`), koszt towaru pokrywa operator ze
  swojego salda u dostawcy.

## 2. Cashback

- Po zakupie klient otrzymuje **3% cashback** z powrotem na portfel Sunrise Pay — przy każdej metodzie płatności.

## 3. Zasady sprzedawców (decyzja właściciela 2026-09-05: dwa poziomy)

- **Sprzedawca** (`sellers.seller_type = 'private_partner'`): uproszczone centrum,
  bez NIP; wypłata **netto na PRYWATNY portfel Sunrise Pay** (`pay-credit`,
  `target: personal`). 12 mies. gratis, potem **299 zł / rok** z góry
  (`partner_program_config.annual_fee_gross`, `platform_config.trade_partner_annual_fee`).
- **Partner Handlowy** (`seller_type = 'business'`, firma z NIP): rozbudowane centrum
  (faktury, statystyki, reklamy, Stripe Connect); wypłata **netto na SALDO FIRMOWE**
  Sunrise Pay (`wallets.merchant_balance`, `pay-credit` z `target: merchant`).
  12 mies. gratis, potem **499 zł / rok** z góry (`platform_config.pay_annual_fee`,
  `pay_subscriptions.annual_fee`).
- Wybór poziomu: `/sprzedawca/dolacz`. Prowizja platformy: **7,9%** (Sunrise Pay),
  **12,9%** (Stripe). Akceptacja regulaminów wymagana przy aktywacji.
- **Metodę płatności wybiera KUPUJĄCY, nie sprzedawca** (decyzja właściciela 2026-09-06): sprzedawca nie może wyłączyć
  karty ani portfela — każdy sprzedawca przyjmuje obie metody, różni się tylko prowizja. Nie budujemy przełącznika
  „akceptuję tylko X” (blokowałby część klientów i rozbijał koszyk z wieloma sprzedawcami).
- Subskrypcje produktowe (np. Protect Plus): zawsze **miesięczne, płatne z góry,
  z ciągłością** (`shop_products.subscription_interval` → `attributes.subscription`).
- Sekret `SUNRISE_MARKET_SERVICE_TOKEN`: gdy brak w env, funkcje czytają
  `market.internal_secrets` (klucz `sunrise_pay_service_token`).

## 4a. Dostawcy przez Base (BaseLinker) — Euroshop, EET, PolZoo (2026-09-07)

- Edge fn `base-polzoo-sync` (verify_jwt **on**) obsługuje wielu dostawców: `polzoo`, `euroshop`, `eet`.
  Akcje: `probe` (test połączenia), `preview` (podgląd partii bez zapisu), `sync` (import).
  Autoryzacja: `x-bridge-token` (BRIDGE_INTERNAL_TOKEN), **`x-sunrise-service-token`** (= `sunrise_pay_service_token`
  z `market.internal_secrets`, wywołania serwis-serwis np. przez `net.http_post`) albo JWT operatora (`ami_operator`).
- Każdy dostawca ma własne znaczniki: `attributes.source` (`euroshop_base` / `eet_base` / `polzoo_base`),
  `attributes.supplier_key`, `offers.fulfillment_provider`. Mapowanie produktów: `market.base_polzoo_product_map`
  (klucz `inventory_id` + `base_product_id`) — powtórny import aktualizuje ofertę, nie tworzy duplikatu.
- **Reguła cenowa (decyzja właściciela 2026-09-07, po badaniu cen na Allegro)**: `cena = min(zakup × (1+marża) ; rynek × price_cap_ratio)`,
  domyślnie `price_cap_ratio = 0.95`; przy marży poniżej progu oferta zostaje szkicem nawet przy
  `activate:true` (licznik `held_low_margin` w odpowiedzi). **Próg jest dwustopniowy (decyzja właściciela 2026-09-07)**:
  `min_margin_small_percent` (domyślnie **15%**) dla pozycji o cenie zakupu poniżej `small_price_below` (domyślnie **100 zł**),
  bo przy taniej pozycji stały koszt wysyłki zjada marżę; `min_margin_percent` (domyślnie **8%**) powyżej tej kwoty.
  Zastosowany próg zapisujemy w `attributes.min_margin_required`.
- **Próg liczymy od marży NETTO, nie brutto (decyzja właściciela 2026-09-07).** Od każdej sprzedaży płacimy
  **cashback 3% od kwoty brutto** plus prowizję płatności; dopiero to, co zostaje, jest zarobkiem.
  `zysk = cena − zakup − cashback_percent%·cena − (payment_fee_percent%·cena + payment_fee_fixed_pln) − shipping_cost_pln`,
  a `net_margin_percent = zysk / zakup`. Domyślnie `cashback_percent = 3`, `payment_fee_percent = 2`,
  `payment_fee_fixed_pln = 1`, `shipping_cost_pln = 0`. W ofercie zapisujemy `margin_percent` (brutto),
  `net_margin_percent`, `net_profit_pln` i `cashback_percent`. **Nigdy nie publikujemy pozycji, która po cashbacku
  i opłatach nie zarabia.** Otwarta decyzja: kto płaci wysyłkę — dopóki `shipping_cost_pln = 0`, próg jej nie uwzględnia.
- **Narzut liczymy wstecz z docelowej marży netto (`target_net_margin_percent`, decyzja właściciela 2026-09-07).**
  Stały narzut od zakupu zawsze zaniża zarobek, bo cashback i prowizja są procentem *ceny*, nie kosztu. Wzór:
  `cena = (zakup·(1 + cel%) + payment_fee_fixed_pln + shipping_cost_pln) / (1 − cashback% − payment_fee%)`.
  Przy `target_net_margin_percent = 25` każda pozycja ląduje na ~25% netto niezależnie od kwoty zakupu.
  Bez tego parametru działa stary `markup_percent` (kompatybilność wstecz), a `price_source` mówi, co zadecydowało
  o cenie: `target_net_margin`, `markup`, `market_cap` albo `break_even_floor`.
- **TWARDA PODŁOGA — nigdzie nie możemy być na minusie (decyzja właściciela 2026-09-07).** Sufit rynkowy nigdy
  nie zepchnie ceny poniżej progu opłacalności: `break_even = (zakup + opłata_stała + wysyłka) / (1 − cashback% − prowizja%)`.
  Jeśli `rynek × price_cap_ratio` wypada poniżej tej kwoty, cena zostaje na podłodze, `price_source = "break_even_floor"`,
  a oferta dostaje `attributes.below_market = true` i zostaje szkicem — nie da się jej sprzedać z zyskiem po cenie rynkowej.
  Dzięki temu **żadna oferta w bazie nie ma ujemnego `net_profit_pln`**, więc ręczna aktywacja nie może wygenerować straty.
  Licznik `unsellable_below_market` w odpowiedzi mówi, ile pozycji nie mieści się pod rynkiem. Cena rynkowa to `attributes.market_lowest_pln` (najniższa oferta Allegro po EAN,
  `market_checked_at`) — sync **scala** atrybuty, więc kolejne importy jej nie kasują. Oferta bez sprawdzonej ceny rynkowej zostaje szkicem.
- **Import zawsze najpierw jako szkice** (`activate:false`); `activate:true` jest odrzucane przy marży ≤ 0.
  Nie publikujemy produktów dostawców bez ustalonej dodatniej marży. Ceny zaokrągla `nicePrice` (do pełnych zł − 1 gr).
- **EET Polska to dystrybutor IT** (sieci, komponenty, peryferia, materiały eksploatacyjne) — nie chemia: własny klasyfikator
  `classifyEet` mapuje na `komputery-i-biuro*`. Katalog Base „EET Polska" (inventory 115759) trzymamy osobno od Domyślnego,
  żeby pełny katalog dostawcy (~35 tys. SKU) nie mieszał się z Euroshopem; do Market idą tylko jawnie wskazane `product_ids`.
- Stan 2026-09-07: Euroshop — 18 ofert kontrolnych (magazyn Base 115697, grupa cen 100979, magazyn `bl_153385`),
  wszystkie `draft`, zmapowane 18/18, 25 zdjęć. EET — 30 ofert z katalogu 115759, z czego **16 aktywnych** (marki własne
  CoreParts/MicroConnect/LanView, marża 25% z sufitem rynkowym, realnie 8,4–31,5%, średnio 23,8%), 5 wstrzymanych progiem
  marży, reszta w szkicach. Po podniesieniu progu do 15% poniżej 100 zł żadna aktywna pozycja nie wypadła — najniższa
  z tanich to 25,8%.
- **Skan katalogu EET (`action:"scan"`, 2026-09-07)** — pełny import Base zakończony: **67 936 SKU**, 67 921 z EAN (99,98%),
  **29 686 dostępnych** (43,7%), 67 929 z ceną. Przedziały cen zakupu: <50 zł — 10 523, 50–100 zł — 5 549,
  100–300 zł — 16 974, 300–1000 zł — 21 598, >1000 zł — 13 285. Marki własne EET (rentowne wg badania):
  CoreParts 4 265, MicroConnect 3 373, eSTUFF 844, LanView 818, Vivolink 686, ProXtend 586 — razem ~10,6 tys. SKU.
  OEM (HP 11 478, Lenovo 9 687, Dell 6 005) **nie nadaje się do publikacji** — kupujemy drożej niż detal.
  `scan` jest read-only (zwraca liczby, koszyki cenowe i liczności marek) — służy kontroli jakości przed importem.
  Z `ids_limit` + filtrami (`require_stock`, `require_ean`, `min_supplier_price`, `max_supplier_price`) zwraca też
  `matched_ids` — gotową listę ID do partii importowej.
- **Partia EET 2026-09-08**: 300 pozycji marek własnych (CoreParts, MicroConnect, LanView, ProXtend, Vivolink, eSTUFF),
  filtr: dostępne od ręki + EAN + zakup 20–600 zł. Zaimportowane jako **szkice** (`activate:false`), 286 nowych ofert,
  151+ zdjęć, średnia marża netto 25,0%, zero pozycji na minusie, 5 nie mieści się pod ceną rynkową.
  Aktywacja czeka na sprawdzenie cen rynkowych po EAN i decyzję właściciela.
- **Allegro blokuje automatyczne sprawdzanie cen (2026-09-08)**: `base-market-check` odpytujące `allegro.pl/listing`
  z serwera dostaje **HTTP 403** (ochrona przed botami, IP centrum danych). Nie obchodzimy zabezpieczeń —
  właściwą drogą jest oficjalne **Allegro Open API** (wyszukiwanie ofert po EAN), które wymaga rejestracji aplikacji
  i pary `client_id`/`client_secret` w sekretach. Do tego czasu ceny rynkowe uzupełniamy ręcznie/przeglądarką,
  a oferty bez `market_lowest_pln` zostają szkicami.
- **Klasyfikator EET rozbudowany (2026-09-08)**: katalog EET to w dużej części części zamienne i akcesoria serwisowe —
  doszły reguły na baterie, matryce LCD, dyski IDE/HDD, narzędzia serwisowe, stojaki i filtry prywatyzujące oraz
  materiały eksploatacyjne do drukarek (fuser, rolki, folia utrwalająca → `peryferia-drukarki`, nie `tonery`).
  Pozycji w korzeniu kategorii: **115 → 24**.
  **Badanie cen 2026-09-07** (44 pozycje po EAN na Allegro): marki własne EET średnio +32,7% zapasu i zero pozycji pod kreską;
  oryginały OEM (Lexmark, Kyocera, HP) +5,5% i 5 z 8 kupowanych drożej niż detal — **nie publikujemy ich**;
  Euroshop +0,5% średnio, 7 z 17 pod kreską — do renegocjacji cennika, na razie wszystko zostaje szkicem. PolZoo — integracja utworzona, wciąż brak jej jako źródła
  importu (czeka na akceptację dostawcy); nie tworzymy drugiej integracji. ABC Kosmetyczne — nie ruszamy (formalności).
  Platon — planowany przez API/WebService, nie przez Base Connect.
- **Ceny rynkowe — Ceneo / Erli / Skąpiec sprawdzone 2026-09-08, żadne nie działa serwerowo.**
  Właściciel poprosił, żeby nie odpytywać Allegro. Wynik testów z sieci Supabase (funkcja `base-market-check` v3):
  **Ceneo** odpowiada 200, ale zawsze tą samą stroną-zasłoną 19 937 B bez ani jednej ceny (również na stronie
  głównej i kategorii) — czyli blokada botów. **Erli** oddaje sam szkielet aplikacji (7 289 B), ceny dociąga
  JavaScript po stronie klienta; `/graphql` i `/api/search` zwracają 404 lub ten sam szkielet. **Skąpiec**
  oddaje pełny HTML z cenami, ale **ignoruje zapytanie** — dla EAN 5904760104273, EAN 5711045462207 i frazy
  „Royal Canin Sterilised 1,5kg" zwraca identyczną listę 20 niezwiązanych produktów (książka o egzemie,
  kolorowanka, kapcie FALKE). Ceny z tej listy są bezużyteczne — nie wolno ich brać za cenę rynkową.
  **Droga do przodu wymaga decyzji właściciela**: oficjalne API (Ceneo dla sklepów albo partnerskie Erli,
  konto i klucz zakłada właściciel) albo odczyt przez prawdziwą przeglądarkę na jego maszynie (wolniejsze,
  wymaga zgody na domenę w rozszerzeniu). Do tego czasu oferty bez `market_lowest_pln` zostają szkicami.
- **Ceny rynkowe działają przez zwykłe wyszukiwanie w sieci (2026-09-08).** Ceneo i Allegro są zablokowane
  (robots.txt / ochrona botów), ale sklepy zoologiczne i IT czytają się normalnie: unizoo.pl, maxizoo.pl,
  netfutter.pl, aligatorzoo.pl, animalcity.pl, fera.pl, morele.net. Metoda: wyszukiwarka po nazwie + pobranie
  strony sklepu. To działa z sesji Claude'a (ręcznie, partiami), nie z edge function — do automatu wciąż
  potrzebne oficjalne API.
- **KONTROLA CEN POLZOO 2026-09-08 — WYNIK ZŁY, NIE AKTYWUJEMY PARTII.** Cztery pozycje sprawdzone
  w polskich sklepach; ceny zapisane w `attributes.market_lowest_pln` / `market_source`:
  | Produkt | Zakup PolZoo | Rynek | Zakup vs rynek |
  |---|---|---|---|
  | ROYAL CANIN CCN Medium Digestive Care 12kg | 263,81 zł | 245,57 zł (unizoo.pl) | **+7,4%** |
  | KONG Extreme XXL | 130,95 zł | 119,00 zł (animalcity.pl) | **+10,0%** |
  | Brit Premium By Nature Adult XL 15kg | 133,84 zł | 137,99 zł (aligatorzoo.pl) | −3,0% |
  | Brit Care Mini Grain-Free Yorkshire 7kg | 149,84 zł | 162,99 zł (netfutter.pl) | −8,1% |
  Na dwóch pozycjach **kupujemy drożej, niż konkurencja sprzedaje detalicznie**, a na pozostałych dwóch zapas
  (3–8%) nie pokrywa nawet cashbacku 3% i prowizji płatności, nie mówiąc o zysku. Hurtowe ceny PolZoo na markach
  premium (Royal Canin, Brit, Acana, KONG) **nie są konkurencyjne w polskim e-commerce**. Wnioski: (1) 300 ofert
  PolZoo zostaje szkicami; (2) do renegocjacji cennik na markach premium albo rezygnacja z tej półki;
  (3) szansa jest w kategoriach bez porównywarki — marki mniej znane, akcesoria, zwierzęta gospodarskie —
  ale każdą partię trzeba przed aktywacją sprawdzić po cenach.
- **PolZoo — katalog i pierwsza partia (2026-09-08)**: import Base Connect zakończony, katalog „PolZoo" = inventory
  **115862** (grupa cen `100979`, magazyn `bl_153385`), **18 200 SKU**, 17 272 z EAN (94,9%), 5 615 dostępnych.
  Pierwsza partia: **300 ofert** (filtr: dostępne + EAN + cena ≥ 20 zł), wszystkie `draft`, 300/300 ze zdjęciem,
  marża netto min 25,0% / śr. 25,7%, zero pozycji pod kreską. Opisy dostawcy są pełne (śr. 2262 znaki).
  Klasyfikator `classifyPolzoo` rozbudowany o zwierzęta gospodarskie (sprawdzane PRZED karmą — „Purina Koń
  rekreacyjny 25 kg" to pasza, nie karma dla psa), zdrowie/suplementy, pielęgnację, akcesoria i marki
  (VETFOOD, Dolfos, Beaphar, AQUAEL, TROPICAL, KONG). Nowe podkategorie: `zwierzeta-zdrowie`,
  `zwierzeta-pielegnacja`, `zwierzeta-akcesoria`, `zwierzeta-gospodarskie`. Pozycji w korzeniu: **90 → 5**.
  **Limit workera**: PolZoo ma po kilkanaście zdjęć na produkt — partie po 300 i 75 kończą się
  `WORKER_RESOURCE_LIMIT`; bezpieczna wielkość to **50 ID na wywołanie**.
- **Opisy produktów (2026-09-08, funkcja v19)**: dostawcy IT podają opis równy nazwie (EET średnio 91 znaków), więc
  `buildDescription()` składa opis z danych, które faktycznie mamy: tekst dostawcy + `Specyfikacja:` (cechy z Base,
  stan, kategoria, symbol producenta, EAN, waga, wymiary) + stopka o wysyłce z magazynu dostawcy.
  **Niczego nie zmyślamy** — brak danej to brak wiersza. Dwie reguły wyniesione z błędu przy pierwszym wdrożeniu (v18):
  (1) `conditionLine()` podaje stan wyłącznie wtedy, gdy dostawca sam go nazwał (refurbished / poleasingowy) — v18
  dopisywał „Produkt fabrycznie nowy" także produktom regenerowanym, czyli twierdzenie nieprawdziwe;
  (2) `dedupePhrases()` usuwa powtórzenia, bo dostawcy sklejają nazwę z opisem. Wynik na 316 ofertach EET:
  średnio 290 znaków, 0 poniżej 150, 0 z fałszywym stanem, 17 poprawnie oznaczonych jako regenerowane.
  **UWAGA przy backfillu**: `sync` przelicza też cenę, więc do samego odświeżenia opisów ZAWSZE podajemy
  `target_net_margin_percent` (dla EET 25) — bez niego `markup` spada do 0 i twarda podłoga zbija ceny do progu
  rentowności (0% marży netto). Zdarzyło się to 2026-09-08 i wymagało powtórnego przeliczenia partii.

## 4. Dropship first-party (TeemDrop)

- Dotyczy **wyłącznie** produktów własnych Sunrise
  (`sellers.seller_type = 'sunrise'` + `offers.fulfillment_provider = 'teemdrop'`).
- Te pozycje: **tylko cashback**, bez prowizji MME/genealogii
  (`commission_model = 'cashback_only'`).
- Sprzedawcy zewnętrzni działają standardowo (własny fulfillment, model
  prowizyjny bez zmian). Koszyk mieszany rozdzielany per pozycja.

## 5. Ochrona Kupujących (decyzja właściciela 2026-09-05)

- **Każda transakcja idzie przez Sunrise** — sprzedawca dostaje wypłatę (`pay-credit`)
  **dopiero po odbiorze towaru**: potwierdzenie kupującego (`buyer_confirm_delivery(p_order)`
  lub per pozycja `buyer_confirm_item_delivery`), doręczenie kuriera (`sync_order_status_from_fulfillment`)
  albo auto-zwolnienie po `platform_config.buyer_protection_hold_days` (**14** dni) —
  cron `market-buyer-protection-release` → `market.auto_release_settlements()`.
- Mechanizm: `checkout` / `stripe-webhook` tworzą `seller_settlements` ze `status='scheduled'`,
  `available_at=null` (blokada); status `delivered`/`completed` na `orders` → trigger
  `trg_release_settlements_on_delivery` → `release_order_settlements` ustawia `available_at=now()`;
  wypłatę robi istniejący cron `retry-seller-settlements`. Rezerwacje bez zmian (`available_at=ends_at`).
- **Wyjątek (wypłata natychmiast)**: odnowienia subskrypcji (`stripe_session_id like 'inv:%'`)
  i zamówienia, których wszystkie pozycje to subskrypcje (`attributes.subscription`) — usługa ciągła.
- **Spory**: kupujący `open_dispute(p_order, p_reason)` (tylko w oknie ochrony) → `orders.status='disputed'`,
  tabela `market.order_disputes`, wypłata wstrzymana, powiadomienia sprzedawcy + operatora.
  Operator: `resolve_dispute(p_dispute, 'release'|'rejected'|'refund', p_note)`; listy:
  `my_order_disputes()`, `operator_disputes()`.
- **Zwroty** wykonuje operator edge fn `order-refund` ({dispute_id}): Stripe `refunds.create`
  lub `pay-credit` na portfel kupującego, potem `resolve_dispute(...,'refund')` → zamówienie `cancelled`,
  settlements `cancelled`, a cashback jest **cofany** przez MySunrise `pay-debit-points` (RPC `sfc_reverse_cashback_by_email`,
  ujemny wpis `cashback_reversal` w `sfc_points_ledger`, idempotentnie per zamówienie; brak cofnięcia nie blokuje zwrotu).
- Zamówienia `paid` niewysłane 30 dni: kupujący dostaje powiadomienie, że może anulować — **bez auto-anulowania**.

## 6. Opinie o sprzedawcach (decyzja właściciela 2026-09-05)

- **Tylko prawdziwe opinie**: `add_review_simple` wymaga opłaconego zamówienia z tą ofertą; prośba o ocenę
  po doręczeniu (`trg_request_reviews_after_delivery`). Kupujący ocenia w **Zamówieniach** przy każdej pozycji
  (`ReviewInline`, RPC `my_reviews`) albo na stronie produktu (`#opinia`). Nigdy nie generujemy ani nie importujemy opinii.
- **Publiczny profil sprzedawcy** `/sprzedawcy/:id` (RPC `seller_public_profile`, anon): ocena, rozkład gwiazdek,
  % polecających, liczba sprzedaży, lista opinii (autor, oferta, „Zweryfikowany zakup”), aktywne oferty.
  Link ze strony produktu (`ProductPageExtras`, blok Sprzedawca).
- **Centrum sprzedaży → Opinie** `/sprzedawca/opinie` (RPC `my_seller_reviews`): sprzedawca odpowiada publicznie
  (`reply_review(p_review, p_text)` → `reviews.seller_reply`), nie edytuje i nie usuwa opinii.
  Nowa opinia → powiadomienie in-app sprzedawcy (`trg_notify_seller_new_review`).
- Odznaki z widoku `seller_reputation`: Aktywny (>0), Zaufany (≥10 opinii, śr. ≥4,5), Super Sprzedawca (≥50, ≥4,8).

## 7. Aplikacja i powiadomienia push (2026-09-05)

- **Podpowiedź „Zapisz aplikację”** tylko na `app.sunrisemarket.pl` (`PwaInstallPrompt`): pasek u dołu, znika
  na stałe po instalacji (`appinstalled` / standalone) i na 7 dni po „Nie teraz”; iOS — instrukcja Udostępnij → Do ekranu początkowego.
  Android/Chrome/Edge: systemowy dialog instalacji odpala się sam przy pierwszym dotknięciu strony (wymóg gestu użytkownika) —
  ale dopiero od 2. wizyty; pierwsze wejście pokazuje tylko zamykany pasek (bez agresywnego popupu, nie zasłania logowania).
- **Web push (VAPID)**: klucze w `market.internal_secrets` (`vapid_public_key`, `vapid_private_key`, `vapid_subject`) — nigdy w repo.
  Subskrypcje `market.push_subscriptions` (RPC `save_push_subscription` / `remove_push_subscription`, klucz publiczny `push_public_key()`),
  włączanie w Moje konto → Ustawienia (`PushToggle`). Każdy wpis `market.notifications` (channel `app`) wysyła edge fn
  `send-web-push` (cron `market-send-web-push` co minutę, znacznik `notifications.push_sent_at`, zaległe >24 h pomijane).
- **Limity doładowania portfela**: `platform_config.topup_min_pln` / `topup_max_pln` (10 / 25 000 zł), publikowane
  przez `public_market_config`. Gdy brak w portfelu przekracza limit, koszyk pokazuje od razu płatność kartą (Stripe).
  `wallet-topup` honoruje `return_to` (koszyk wraca do `/koszyk?topup=success` i sam kończy zakup).

## 8. Odbiór osobisty u sprzedawcy i w Sunrise (decyzje właściciela 2026-09-05, rozszerzenie 2026-09-06)

- **Produkty Sunrise (magazyn własny, `fulfillment_provider='mysunrise'`) mają odbiór osobisty w Nowym Tomyślu**: tor koszyka `ours`
  + metoda `pickup` „Odbiór osobisty (Nowy Tomyśl)” (0 zł); punkt = `sellers.pickup_*` sprzedawcy `sunrise` (Kolejowa 20, 64-300 Nowy
  Tomyśl, po wcześniejszym umówieniu). Domyślnie zaznaczona jest wysyłka. Dropship (`teemdrop`) ma osobny tor `dropship` **bez**
  odbioru (towar idzie od dostawcy do klienta). Migracja 20260907160000.

- Sprzedawca włącza punkt odbioru w `/sprzedawca/odbior` (`sellers.pickup_enabled/pickup_address/pickup_hours/pickup_note`,
  RPC `my_pickup_settings` / `set_pickup_settings`). Wtedy jego oferty mają w koszyku tor `seller_pickup`
  (`cart_lanes`) z metodą `seller_pickup` (0 zł) obok wysyłki; domyślnie wybrana jest wysyłka.
- `checkout` zapisuje `orders.shipping_codes`; `create_fulfillment_tasks` ustawia `fulfillment_tasks.delivery='pickup'`
  dla pozycji do odbioru. Sprzedawca w Zamówieniach: `mark_pickup(p_order,'ready')` → status `ready_for_pickup`
  + powiadomienie klienta z adresem; `mark_pickup(p_order,'hand_over')` → `handed_over` → zamówienie `delivered`
  (Ochrona Kupujących 14 dni jak przy kurierze). Kupujący widzi punkt, godziny i status w `my_orders.pickup`.
- Sprzedający prywatny (`private_partner_set_fulfillment`) rozpoznaje odbiór po `fulfillment_tasks.delivery` / kodach.

## 9. Ekran startowy „hub” (decyzja właściciela 2026-09-05, „jest premium”)

- Na telefonie (≤ 640 px) i w aplikacji app.sunrisemarket.pl strona główna to `Start.tsx` (spójny z desktopem, nie kopia 1:1):
  niski top bar (logo, dzwonek, koszyk, konto), wyszukiwarka → `/szukaj?q=`, hero z grafiką właściciela (`public/hero/home-hero.webp`, cały obrazek, link do /szukaj), hasło „Kupuj. Rezerwuj. Zarabiaj.”, 6 kafli w 2 kolumnach
  (Zakupy `/sklep`, Rezerwacje `?tryb=appointment`, Nieruchomości, Motoryzacja, Usługi `?kat=uslugi-i-reklama`, OZE i Energia
  `?kat=oze-i-energia`), poziomy carousel „Dla Ciebie” (zalogowany, `recommended_offers`) / „Polecane” (gość: `home_promoted`
  → `search_offers_v2`) z ♡, chipy „Popularne” (kategorie z ofertami), karta Rezerwacje (`/szukaj?tryb=appointment`, `/rezerwacje`),
  widget cashback ze stawką z `public_market_config`, wejście „Sprzedawaj na Sunrise Market”.
- Strony `/o-nas` (`ONas.tsx`) i `/pomoc` (`Pomoc.tsx`, FAQ z wyszukiwarką) — treść tylko z obowiązujących zasad; linki w pasku działów (Pomoc), stopce i stronach legal.
- Wspólna „rama” stron w `src/components/home/SiteChrome.tsx`: `SiteHeader` (duży ekran: logo · wyszukiwarka · Moje konto · Ulubione ·
  Dodaj ogłoszenie + pasek działów z podświetleniem `active`; telefon: niski pasek logo · dzwonek · koszyk · konto), `Breadcrumbs`,
  `SectionTitle` (pomarańczowa belka), `SideNav`. Używają jej: Home, Ulubione (`/obserwowane`), `/szukaj` (filtry w lewej kolumnie),
  strony ofert (`Product`, `SpecializedProduct`), portale Motoryzacja/Nieruchomości, Moje konto. Panel Partnera (`PartnerDashboard`)
  ma lewy panel sekcji sprzedawcy i tonowane kafle statystyk. Nowe strony budujemy na tej ramie — nie piszemy własnych nagłówków.
- Wspólne elementy desktop/mobile w `src/components/home/HomeShared.tsx`: ikony SVG, `SECTIONS` (działy i trasy), `RecoCard`,
  `useHomeFeed`, `usePopularCategories`. Nowe sekcje strony głównej budujemy z nich — nie duplikujemy kart/ikon.
- **Duży ekran sunrisemarket.pl** (> 640 px): `Home.tsx` — premium landing (ciemne tło, złoty akcent): nagłówek z centralną
  wyszukiwarką → `/szukaj?q=`, menu kategorii (tylko istniejące sekcje), hero „Wszystko, czego potrzebujesz w jednym miejscu.” z grafiką właściciela (`public/hero/home-hero.webp/.jpg`, wycięta
  z makiety 2026-09-06; tekst i przyciski żywe po lewej, gradient), 6 kafli działów (= pasek działów; `SECTIONS` w całości), „Polecane ogłoszenia” (RPC `recommended_offers` + `home_promoted`, 4 kolumny, ♡ watchlist),
  „Popularne kategorie” (kategorie główne z `category_counts` > 0), stopka z realnymi stronami `/legal/*`.
  Pełny katalog z filtrami/banerami/Strefą Energii (`MarketEnhanced`) jest pod `/sklep`; `/?q=` nadal otwiera katalog.
  Bez lokalizacji użytkownika, „O nas” i social — takich funkcji/stron nie ma; nie wymyślamy ich.
- Dolny pasek aplikacji (`MobileAppNav`, ikony SVG, cele ≥ 44 px): Start · Szukaj · ＋ Dodaj (`/sprzedawca/wystaw`, złote kółko) · Ulubione (`/obserwowane`) · Konto.
- `/szukaj` czyta parametry `q`, `kat` (slug kategorii), `tryb` (purchase|appointment|daily), `lok` przy KAŻDEJ zmianie adresu (pasek działów, kafle) i od razu szuka;
  zmiana kategorii/trybu/sortowania w filtrach szuka sama i cicho aktualizuje adres (`replaceState`). Drzewo kategorii cache'owane w module (2026-09-06).

## 10. Wiadomości, kontakt, lokalizacja, wyświetlenia (decyzja właściciela 2026-09-06)

- **Wiadomości** kupujący ↔ sprzedawca: `market.conversations` (wątek = oferta + kupujący) i `market.messages`; RPC `start_conversation(p_offer,p_body)`
  (z karty oferty, `MessageSellerButton`), `send_message`, `my_conversations`, `conversation_messages` (oznacza przeczytane), `unread_messages_count`.
  Ekran `/wiadomosci` (`Wiadomosci.tsx`, `?w=<id>`), ikona koperty z licznikiem w nagłówku, pozycja w menu konta i sprzedawcy.
  Powiadomienia przez `notify_once` (in-app + push). Bez e-maili. Lead z telefonem („Zapytaj o ofertę”, `create_offer_lead`) zostaje obok.
- **Telefon sprzedawcy**: `sellers.phone_public` (opt-in w `/sprzedawca/odbior` — „Odbiór i kontakt”, RPC `my_contact_settings` /
  `set_contact_settings`). `ShowPhoneButton`: `offer_has_phone` (anon) → „Pokaż numer” → `offer_seller_phone` **tylko dla zalogowanych**.
- **Umów oględziny / prezentację**: istniejący `create_interaction_request` (BuyerOfferActions, typy viewing/demo/consultation…);
  przycisk w karcie oferty auta/nieruchomości otwiera to okno zdarzeniem `sunrise-open-interaction`. Nie budujemy drugiego kalendarza.
- **Lokalizacja**: `offers.attributes.location` (pole „Miejscowość” w kreatorach i edycji), filtr `p_filters.location` (ilike) w `search_offers_v2`,
  wybór regionu „Cała Polska / województwo” w nagłówku (`SiteHeader`, localStorage `sm:region`, parametr `?lok=`), pole „Lokalizacja” w filtrach.
  Mapa: `LocationMap` — Nominatim (OSM) w przeglądarce + iframe OSM, tylko miejscowość/okolica, bez kluczy API.
  Plakietkę pod adresem dobiera `locationKind(category_slug, purchase_mode)` (2026-09-07): `pickup` — wynajem/najem: „Odbiór i zwrot na miejscu”,
  bez promienia; `none` — motoryzacja i nieruchomości: sam adres; `install` — OZE/dom i ogród: „Montaż i dojazd…”; `service` — pozostałe usługi:
  „Dojazd do klienta…”. Promień dojazdu (`service_radius_km`) zdjęty z ofert motoryzacji i nieruchomości (migracja 20260907190000) —
  wcześniej auto na wynajem pokazywało „Montaż i dojazd w całej Polsce”.
- **Wyświetlenia**: `offers.view_count` przez `count_offer_view(p_offer)` (także goście; wołane raz w `ProductRouter`); `track_view` bez zmian
  (rekomendacje). RPC `seller_offer_stats()` → tabela „Twoje ogłoszenia” w Panelu Partnera (wyświetlenia, ulubione, status).
  `search_offers_v2` / `recommended_offers` / `my_watchlist` zwracają `created_at` (karty pokazują „x godz. temu”, `timeAgo`) i `views`;
  sortowanie `popularne`.

## 11. Testy i spójność stron (2026-09-06)

- `npm test` musi być zielony. 47 nieaktualnych przypadków (asercje na tekst starych implementacji) ma `{ skip: 'nieaktualny — …' }`,
  5 plików z asercjami na poziomie modułu leży w `tests/_stale/` (poza globem). Przy zmianie danej funkcji: przepisać lub usunąć skip.
- Wszystkie strony klienta (katalog `/sklep`, Koszyk, Zamówienia, Rezerwacje, Portfel, Cennik, Porównaj, profil sprzedawcy,
  oferty prywatne) używają `SiteHeader` z `SiteChrome`; strony sprzedawcy `/sprzedawca*` mają `SellerTopBar`.
- Jasny motyw: hero na stronie głównej ma zawsze jasny tekst (grafika jest ciemna), kafle tonowane kończą się na `var(--glass)`.
- Oferty marki własnej Sunrise bez miejscowości dostały „Nowy Tomyśl, wielkopolskie” (migracja 20260906130000).

## 12. Obszar działania marek własnych — CAŁA POLSKA i SEO miast (decyzja właściciela 2026-09-06: 200 → 500 → „cały kraj”)

- Marki własne Sunrise **montują w całej Polsce**. Technicznie: `attributes.service_radius_km=600`, `service_lat/lon` (Nowy Tomyśl) —
  600 km obejmuje każde miasto w kraju (najdalsze Przemyśl ≈ 545 km). W treściach piszemy „montaż w całej Polsce” (bez kilometrów);
  karty przy zasięgu ≥ 600 pokazują „📍 Nowy Tomyśl · cała Polska”, `LocationMap` — „Montaż i dojazd w całej Polsce”.
  Stałe: `SERVICE_RADIUS_KM` (cities.ts) i `RADIUS_KM` (api/_shared.ts) = 600; opcja sprzedawcy `RADIUS_OPTIONS` 600 = „Cała Polska”.
- `market.service_cities` (78 miast, w tym wschód: Suwałki, Ełk, Ostrołęka, Biała Podlaska, Chełm, Zamość, Stalowa Wola, Tarnobrzeg,
  Mielec, Przemyśl, Krosno, Sanok) = `src/lib/cities.ts` = `api/_shared.ts` — zmieniać razem (migracja 20260907140000).
  `market.offer_serves(attrs, loc)`: lokalizacja pasuje tekstowo ALBO miasto/województwo leży w promieniu oferty
  (`km_between`). Używane w filtrze `location` `search_offers_v2` i w `city_offers(p_slug)`.
- **Sunrise Market jest platformą DLA WSZYSTKICH** (sprzedawcy prywatni, firmy, marki własne) — strony miast i SEO nie mogą
  sprowadzać serwisu do OZE Sunrise. **Strony miast** `/miasto` i `/miasto/<slug>` (`CityLanding.tsx`; stare `/oze*` przekierowują):
  H1 „Kupuj i sprzedawaj w …”, wszystkie oferty obsługujące miasto (lokalizacja tekstowa albo zasięg dojazdu), OZE jako jedna
  z sekcji, FAQ, CTA „Sprzedajesz w …? Dodaj ogłoszenie”, linki do miast, JSON-LD WebPage/FAQ. Roboty (UA w `vercel.json`) dostają
  ten sam HTML z `api/miasto.ts`; `/sitemap.xml` → `api/sitemap.ts` (statyczne + miasta + aktywne oferty).
  Linki do miast: sekcja „Sunrise Market w Twoim mieście” na stronie głównej i w stopce (`HomeFooter`).
- Każdy sprzedawca może ustawić własny **zasięg dojazdu** (pole „Dojazd do klienta w promieniu (km)” w kreatorach i edycji →
  `attributes.service_radius_km` + `service_lat/lon` geokodowane z miejscowości przez Nominatim) — wtedy jego oferta trafia
  na strony miast i do filtra lokalizacji w promieniu.
- W treściach o płatności piszemy „portfel Sunrise Pay lub karta” — bez BLIK/P24 (§1).

### Zdjęcia ofert (2026-09-06)
- **Transformacja Supabase MUSI dostać `width` + `height` + `resize`** (`contain` dla galerii, `cover` dla kart). Przy samym
  `width` zwraca obraz o zepsutych proporcjach (HEIC 4032×3024 → 2000×4284, JPEG → wąski pasek). Pilnują tego
  `displayImageUrl` (imageUrl.ts) i `productImageUrl` (api.ts) — nie budujemy adresów `?width=` ręcznie.
- Zdjęcia trzymamy w buckecie `product-images`; **do wyświetlania zawsze przez `/storage/v1/render/image/public/...`**
  (`src/lib/imageUrl.ts` → `displayImageUrl(url, width, height?)`): transformacja zmniejsza plik i przekodowuje formaty,
  których przeglądarki nie znają. **HEIC/HEIF z iPhone'a nie wyświetla się nigdzie poza Safari** — dlatego
  `uploadProductImage` (api.ts) najpierw próbuje przekodować plik w przeglądarce (canvas → JPEG, maks. 2000 px),
  a adres i tak zwraca przez `/render/image` (`productImageUrl`). Edge fn `heic-to-jpg` (auth X-Sunrise-Service-Token)
  konwertuje zaległe pliki HEIC na `.jpg` (`mode:"convert"`) i robi kopie pod nową nazwą, gdy trzeba ominąć roczny cache CDN
  (`mode:"revision"` → `<base>-v2.jpg`). Uruchomiona 2026-09-06 dla 7 zdjęć Forda.
- `market.offer_images(p_offer)` zwraca główne zdjęcie **bez kadrowania** (`?width=1600&quality=82`), żeby galeria nie
  pokazywała przyciętego kadru z karty (karty nadal używają `offers.image_url` z `resize=cover`).

## 13. Wynajem na dni — umowa, protokół „na żywo”, zegarek (decyzje właściciela 2026-09-06)
- **Umowa najmu akceptowana na początku, w momencie zapłaty z góry razem z kaucją.** `src/lib/rentalAgreement.ts` (wersja `RENTAL_AGREEMENT_VERSION`, tekst rygorystyczny — wzór bez prawnika, do sprawdzenia). W `BookingPurchaseModal` klient podaje dane najemcy (imię, telefon, dokument; dla pojazdu prawo jazdy + od roku) i zaznacza akceptację → `market.accept_rental_agreement(booking, wersja, sha256 tekstu, renter, UA)` → `market.booking_agreements`. Edge fn `checkout` odrzuca rezerwację dobową bez zaakceptowanej umowy. Podgląd: `market.my_rental_agreement` (klient i sprzedawca) — `RentalAgreementBadge`.
- **Zdjęcia protokołu tylko „teraz”**: przycisk aparatu (`capture="environment"`), serwer (`booking-protocol`) odrzuca zdjęcia z EXIF starszym niż 15 min, poza oknem (wydanie: −24 h → koniec; zwrot: start → +72 h), zapisuje sha256, czas serwera, EXIF, rolę (seller/buyer), GPS, skew zegara. Klient też fotografuje (własne zdjęcia — nieusuwalne). `save_handover/save_return` wymagają ≥1 zdjęcia; czas etapu ustawia serwer. Zwrot zapisany → booking `completed` (serwer).
- **Zegarek**: `market.rental_protocol_event(booking, event)` (in-app `notify_once` + e-mail `enqueue_mail`) i cron `market-rental-protocol-tick` co 15 min (`rental_protocol_tick`): „dziś wydanie/zwrot” 2 h przed, alarm bez protokołu 3 h po starcie, auto-`completed` po zwrocie, przypomnienie o kaucji 24 h po zwrocie. Edge fn woła eventy po zapisie etapu, odpowiedzi klienta, zdjęciach klienta.
- Pełna treść umowy w `booking_agreements.agreement_text` (RPC weryfikuje sha256 po stronie serwera); po opłaceniu (trigger `trg_booking_paid_agreement_mail` na `bookings.paid_at`) obie strony dostają umowę e-mailem (`send_rental_agreement_mail` → `enqueue_mail`, klucz `rental_agreement:<booking>`).
- `get_offer` NIE wycina `purchase_mode`/`offer_type` (2026-09-06) — bez nich oferta wynajmu renderowała się jak zwykły produkt.
- **Podpis kodem** przy wydaniu/zwrocie: sprzedawca „Wyślij kod klientowi” (`issue_code` → `market.issue_handover_code`: 6 cyfr, in-app + e-mail, 15 min, 5 prób; tabela `booking_handover_codes`), klient widzi kod w rezerwacji (`active_handover_code`), sprzedawca wpisuje → `verify_code` → `handover_code_verified_at`/`return_code_verified_at`. SMS działa: `market.send_market_sms(phone, body, kind)` → pg_net → hub MySunrise `mkt-sms` (auth X-Sunrise-Service-Token = `sunrise_pay_service_token`) → `send-sms` (SMSAPI). Kod idzie SMS-em na `booking_agreements.renter.phone`; `rental_protocol_tick` wysyła też SMS „dziś odbiór/zwrot” (dedupe w `market.sms_log`). Kopia kodu funkcji huba: `docs/mysunrise-edge/mkt-sms.index.ts` (źródło w repo mysunrise-source). SMS-y bez polskich znaków (1 segment GSM).
- **Rabaty za długość najmu** (do 10% dla Fiesty: od 4 dni −5%, od 8 dni −10%): `booking_offers.length_discounts`, `booking_length_discount()` w wycenie i holdzie (od czynszu, nie od kaucji), ustawienia sprzedawcy w bookingu. Wymóg 2 lat prawa jazdy: `rental_operations.min_license_years` (domyślnie 2). Stopka: profile social ekosystemu (Facebook Sunrise Energy, Instagram sunriseenergy.pl) — `SOCIAL_LINKS` w HomeShared.
- **Faktura na firmę = NIP podkłada dane** (decyzja właściciela 2026-09-06): `InvoiceDetailsFields` (koszyk i rezerwacje) po wpisaniu 10 cyfr NIP woła `src/lib/nip.ts` → edge fn `nip-lookup` (Biała Lista MF) i wypełnia nazwę, ulicę, kod, miasto (`splitPlAddress`); suma kontrolna NIP sprawdzana lokalnie. Pola można poprawić ręcznie.
- **Test end-to-end wynajmu (2026-09-06)** wykrył dwie awarie produkcyjne, obie naprawione (migracje 20260907170000, 20260907180000):
  `create_booking_hold_v2` i `verify_handover_link` miały parametry OUT (`hold_expires_at`, `booking_id`) kolidujące z kolumnami —
  **każda rezerwacja** i **cały odbiór przez QR** kończyły się błędem „column reference … is ambiguous”. Reguła: w funkcjach
  `RETURNS TABLE(...)` aliasujemy tabele w UPDATE/INSERT (`update market.bookings b set ... where b.…`) i nie używamy
  `on conflict (kolumna)` o nazwie parametru OUT. `verify_handover_code` zakłada protokół, gdy go jeszcze nie ma.
  Przebieg testu (bez realnej płatności): wycena → hold → umowa → symulacja opłaty (`confirm_paid_booking`) → kod SMS/e-mail →
  QR → kod zwrotu → `seller_booking_deposit_prepare_v2` (kaucja 1000 zł do zwrotu) → dane testowe usunięte.
- **Okno rezerwacji ma „Wróć”**: `BookingPurchaseModal` dokłada wpis historii (`history.pushState`) — gest/przycisk wstecz telefonu, Esc, tło i przycisk „← Wróć” zamykają okno i wracają do oferty.

## 14. Unowocześnienie (decyzje właściciela 2026-09-06 — cała lista zatwierdzona)
- **Logowanie Face ID / Touch ID (passkeys, WebAuthn)** — bez Google/Apple: konto jest powiązane z MySunrise, passkey to tylko drugi sposób wejścia do TEGO SAMEGO konta. Tabele `market.passkeys`, `market.passkey_challenges`; RPC `my_passkeys`, `delete_passkey`, `passkeys_for_email` (service). Edge fn `passkey` (verify_jwt off; `register_*` sprawdza JWT ręcznie): `register_options/verify`, `login_options/verify` → po weryfikacji `admin.generateLink(magiclink)` → `token_hash` → klient `supabase.auth.verifyOtp({token_hash,type:"magiclink"})`. RP ID `sunrisemarket.pl` (obejmuje app.), origin z listy. Front: `src/lib/passkeys.ts` (`@simplewebauthn/browser`), przycisk „Zaloguj przez Face ID” w `Login.tsx` (tylko gdy `platformAuthenticatorIsAvailable`), karta `PasskeyCard` w Moje konto → Ustawienia + zachęta `PasskeyNudge` na przeglądzie (30 dni „Nie teraz”).
- **Wyszukiwarka**: `SearchBox` (nagłówek desktop, Start, /szukaj) — podpowiedzi po 2 znakach z RPC `search_suggest` (oferty z miniaturą, kategorie, miasta), ostatnie wyszukiwania w localStorage `sm:recent`, obsługa klawiatury. `/szukaj`: chipy aktywnych filtrów (`ActiveFilterChips`), „🔔 Zapisz wyszukiwanie” (`SavedSearchButton` → `market.save_search`, max 20). `market.saved_searches` + cron `market-saved-search-tick` (*/30) → `saved_search_tick()` → `notify_once` typ `search` (in-app + push); lista w Ulubionych (`SavedSearchList`), `?zapisane=<id>` odtwarza kryteria i zeruje licznik (`touch_saved_search`).
- **Strona oferty premium (telefon)**: `SwipeGallery` (Product.tsx) — przesuwanie palcem, kropki, licznik, pełny ekran z przesuwaniem i podwójnym dotknięciem (wpis historii → gest wstecz zamyka); SpecializedProduct ma własną galerię ze swipe i lupą. Lepki pasek (`BuyerOfferActions`): ♡ · ikona kontaktu · cena · „🛡 Kup przez Sunrise” (zakup z ceną, poza nieruchomościami) albo akcja rezerwacji/zapytania. „Inne od tego sprzedawcy” (`ProductPageExtras`, z `seller_public_profile`). Udostępnianie: `ShareOfferButton` (Web Share API).
- **Asystent Suri — „Sunny” (UKRYTY od 2026-09-07** — decyzja właściciela na czas zerowego salda AI; przełącznik `SUNNY_ENABLED` w `AppChrome` w `src/main.tsx`, kod i grafiki zostają w repo)** (persona: Suri jest mózgiem operacyjnym ekosystemu, w Market działa jej asystent; nazwa w `ASSISTANT_NAME` w `SuriChat.tsx` i `suri-commerce`): pływający przycisk na stronach klienta (`AppChrome` w main.tsx; nie w /sprzedawca, /operator, /koszyk), arkusz od dołu na telefonie. Model: hub MySunrise edge fn **`mkt-ai`** (OpenAI gpt-4o-mini + zdjęcia; auth X-Sunrise-Service-Token; kopia: `docs/mysunrise-edge/mkt-ai.index.ts`) → fallback ANTHROPIC_API_KEY → bez AI asystent nadal działa: `parseIntent` (słowa kluczowe → kategoria/tryb/budżet/fraza) + `suri_recommend(p_query,p_budget,p_category_slug,p_limit,p_mode)` (filtr kategorii z podkategoriami i trybu; bez kategorii/trybu zwraca tylko realne trafienia, nigdy losowe) + FAQ o zasadach (`faqReply`, bez listy ofert przy pytaniach). `suri-commerce` akcje: chat, history, `seller_reply` (Wiadomości: przycisk ✨ → 2 propozycje odpowiedzi). `gen-description` pisze opis przez hub z `image_urls` (do 4 zdjęć) i `attributes` z formularza. **Uwaga: OpenAI i Anthropic mają zerowe saldo (2026-09-06) — właściciel musi doładować platform.openai.com, inaczej AI odpowiada trybem zapasowym.**
- **Odbiór/zwrot przez QR**: sprzedawca w protokole „Pokaż klientowi kod QR” (`HandoverQr` → RPC `issue_handover_link`, token 15 min w `booking_handover_codes.link_token`, biblioteka `qrcode`), klient skanuje → `/odbior/:token` (`Odbior.tsx`; logowanie z powrotem) → `verify_handover_link` ustawia `handover/return_code_verified_at` (tworzy protokół, gdy brak) → od razu `BuyerRentalProtocolCard` (zdjęcia, potwierdzenie). Kod SMS zostaje jako alternatywa.
- **Puls sprzedawcy** `/sprzedawca/puls` (`SellerPulse.tsx`, pozycja w `SELLER_NAV` i kafel na pulpicie): `market.offer_daily_stats` (dzień × ogłoszenie: views/favorites/leads/messages — `bump_offer_stat` z `count_offer_view` i triggerów na watchlist/offer_leads/conversations), RPC `seller_pulse(p_days)` → sumy z porównaniem do poprzedniego okresu, seria dzienna, sprzedaże, per ogłoszenie: trend 7 dni, mediana ceny i wyświetleń kategorii, liczba zdjęć, długość opisu. Podpowiedzi liczone z danych (cena vs mediana, brak zdjęć, krótki opis, spadek wyświetleń) — bez obietnic. „Promuj 7 dni” → `promoteOffer`.
- **Centrum powiadomień** `/powiadomienia` (`Powiadomienia.tsx`; dzwonek pokazuje 8 ostatnich z akcją i link „Wszystkie”): `market.notification_link(n)` liczy `href` + etykietę akcji z typu, uuid w `dedupe_key` i roli (sprzedawca tej rezerwacji/zamówienia czy kupujący): rezerwacje → `/rezerwacje#b-<id>` lub `/sprzedawca/rezerwacje#b-<id>` (karty mają `id="b-<uuid>"`), zamówienia, wiadomości `?w=`, zapytania, opinie, zapisane wyszukiwania `?zapisane=`. RPC `my_inbox(p_limit)`, `mark_notification_read(p_id)`; `my_notifications` zwraca też href/action. Filtry: Wszystkie / Do zrobienia / Nieprzeczytane.
- **Szlif i wydajność**: podział bundla (`React.lazy` dla 36 rzadszych stron w `main.tsx` + `manualChunks` react/supabase w `vite.config.ts`; główny pakiet 1,3 MB → ~390 KB), szkielety (`components/Skeleton.tsx`: `PageSkeleton` w Suspense, `ProductSkeleton`, `OfferCardSkeleton`), motyw wg systemu (`lib/theme.ts`: `prefers-color-scheme` gdy brak wyboru, skrypt w `index.html` bez mignięcia); przełącznik ☀️/🌙 także na telefonie (`ThemeToggle size={11}` w niskim pasku `SiteHeader` i `Start`) oraz karta „Wygląd” (Jak system / Jasny / Ciemny) w Moje konto → Ustawienia (`ThemeSettings`), fonty Google nieblokująco (preconnect + `media=print→all`), View Transitions dla nawigacji pełnych + `.page-enter` w SPA (reduced-motion respektowane), SW v3: assety z hashem cache-first, obrazy/fonty stale-while-revalidate, ostatnio oglądane oferty offline (`getOffer` → wiadomość `cache-offer` do SW → cache `sunrise-market-data-v1`), push otwiera `/powiadomienia`. Lighthouse (mobile, symulacja, preview lokalny): wydajność 81, dostępność 96, best practices 96; LCP to tekst renderowany po JS+danych — kolejny krok: prerender/SSR strony startowej.
- **Postać asystenta** (grafiki właściciela, `public/sunny/`): `sunny-head.png` (przycisk i nagłówek czatu), `sunny-point.webp`, `sunny-wave.webp` (gdy brak wyników), `sunny-hello.mp4` + `.jpg` (powitanie 5 s, bez dźwięku, przy pierwszym otwarciu). Przycisk zakupu: „Kup teraz · 🛡 Ochrona Kupujących” (nie „Kup przez Sunrise” — decyzja właściciela 2026-09-06).
