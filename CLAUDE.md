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
  po doręczeniu (`trg_request_reviews_after_delivery`). Nigdy nie generujemy ani nie importujemy opinii.
- **Publiczny profil sprzedawcy** `/sprzedawcy/:id` (RPC `seller_public_profile`, anon): ocena, rozkład gwiazdek,
  % polecających, liczba sprzedaży, lista opinii (autor, oferta, „Zweryfikowany zakup”), aktywne oferty.
  Link ze strony produktu (`ProductPageExtras`, blok Sprzedawca).
- **Centrum sprzedaży → Opinie** `/sprzedawca/opinie` (RPC `my_seller_reviews`): sprzedawca odpowiada publicznie
  (`reply_review(p_review, p_text)` → `reviews.seller_reply`), nie edytuje i nie usuwa opinii.
  Nowa opinia → powiadomienie in-app sprzedawcy (`trg_notify_seller_new_review`).
- Odznaki z widoku `seller_reputation`: Aktywny (>0), Zaufany (≥10 opinii, śr. ≥4,5), Super Sprzedawca (≥50, ≥4,8).
