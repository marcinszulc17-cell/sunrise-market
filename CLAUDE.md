# Sunrise — reguły projektu (twarde inwarianty)

Te zasady obowiązują we WSZYSTKICH projektach ekosystemu Sunrise i mają
pierwszeństwo przy każdej zmianie kodu. Nie wolno ich naruszać ani obchodzić.

## 1. Płatności: portfel promowany + karta do wyboru (decyzja właściciela 2026-08-11, cashback dla wszystkich metod 2026-09-05)

- **Zakupy jednorazowe**: portfel Sunrise Pay jest metodą **promowaną**
  (główny przycisk) + do wyboru **karta/P24/BLIK przez Stripe** (drugi przycisk).
- **Cashback 3% przy KAŻDEJ metodzie płatności** — portfel, karta/BLIK/P24,
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
- Subskrypcje produktowe (np. Protect Plus): zawsze **miesięczne, płatne z góry,
  z ciągłością** (`shop_products.subscription_interval` → `attributes.subscription`).
- Sekret `SUNRISE_MARKET_SERVICE_TOKEN`: gdy brak w env, funkcje czytają
  `market.internal_secrets` (klucz `sunrise_pay_service_token`).

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

## 8. Odbiór osobisty u sprzedawcy (decyzja właściciela 2026-09-05)

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
  niski top bar (logo, dzwonek, koszyk, konto), wyszukiwarka → `/szukaj?q=`, hasło „Kupuj. Rezerwuj. Zarabiaj.”, 6 kafli w 2 kolumnach
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
  wyszukiwarką → `/szukaj?q=`, menu kategorii (tylko istniejące sekcje), hero „Wszystko, czego potrzebujesz w jednym miejscu.”,
  6 kafli, „Polecane ogłoszenia” (RPC `recommended_offers` + `home_promoted`, 4 kolumny, ♡ watchlist),
  „Popularne kategorie” (kategorie główne z `category_counts` > 0), stopka z realnymi stronami `/legal/*`.
  Pełny katalog z filtrami/banerami/Strefą Energii (`MarketEnhanced`) jest pod `/sklep`; `/?q=` nadal otwiera katalog.
  Bez lokalizacji użytkownika, „O nas” i social — takich funkcji/stron nie ma; nie wymyślamy ich.
- Dolny pasek aplikacji (`MobileAppNav`, ikony SVG, cele ≥ 44 px): Start · Szukaj · ＋ Dodaj (`/sprzedawca/wystaw`, złote kółko) · Ulubione (`/obserwowane`) · Konto.
- `/szukaj` czyta parametry `q`, `kat` (slug kategorii), `tryb` (purchase|appointment|daily) i od razu szuka.

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

## 12. Obszar działania marek własnych — 200 km i SEO miast (decyzja właściciela 2026-09-06)

- Marki własne Sunrise są dostępne w promieniu **200 km od Nowego Tomyśla** (wielkopolskie, lubuskie, dolnośląskie,
  zachodniopomorskie, kujawsko-pomorskie). Oferty `seller_type='sunrise'` mają `attributes.service_radius_km=200`,
  `service_lat/lon` (Nowy Tomyśl); karty pokazują „📍 Nowy Tomyśl · +200 km”, `LocationMap` — notkę o zasięgu.
- `market.service_cities` (27 miast ≤ 200 km, z lat/lon) = `src/lib/cities.ts` = `api/_shared.ts` — zmieniać razem.
  `market.offer_serves(attrs, loc)`: lokalizacja pasuje tekstowo ALBO miasto/województwo leży w promieniu oferty
  (`km_between`). Używane w filtrze `location` `search_offers_v2` i w `city_offers(p_slug)`.
- **Strony miast** `/oze` i `/oze/<slug>` (`CityLanding.tsx`): H1 „Fotowoltaika, pompy ciepła i magazyny energii w …”,
  prawdziwe oferty, odległość, FAQ, linki do pozostałych miast, JSON-LD Service/FAQ. Roboty (UA w `vercel.json`) dostają
  ten sam HTML z `api/miasto.ts`; `/sitemap.xml` → `api/sitemap.ts` (statyczne + miasta + aktywne oferty).
  Linki do miast: sekcja na stronie głównej i w stopce (`HomeFooter`). Nie dodajemy miast spoza 200 km bez decyzji właściciela.
