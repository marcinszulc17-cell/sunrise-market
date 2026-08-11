# Sunrise — reguły projektu (twarde inwarianty)

Te zasady obowiązują we WSZYSTKICH projektach ekosystemu Sunrise i mają
pierwszeństwo przy każdej zmianie kodu. Nie wolno ich naruszać ani obchodzić.

## 1. Płatności: portfel promowany + karta do wyboru (decyzja właściciela 2026-08-11)

- **Zakupy jednorazowe**: portfel Sunrise Pay jest metodą **promowaną**
  (główny przycisk, **jedyna metoda z cashbackiem 3%**) + do wyboru
  **karta/P24/BLIK przez Stripe** (drugi przycisk, bez cashbacku).
- **Subskrypcje**: rozliczane **wyłącznie przez Stripe**.
- Płatność kartą: edge `checkout` z `payment_method='card'` tworzy sesję
  Stripe Checkout; `stripe-webhook` po opłacie ustawia `paid`, nalicza wypłaty
  sprzedawcom (te same stawki) i prowizję MLM marki własnej — **bez cashbacku**.
- Portfel: checkout woła `pay-charge`; brak środków → `need_topup`, UI proponuje
  punkty/doładowanie w koszyku, a poniżej alternatywę kartą.
- Integracje fulfillmentu (np. most TeemDrop → WooCommerce) **nie pobierają
  płatności od klienta** — zamówienie w systemie zewnętrznym jest tylko
  sygnałem realizacji (`set_paid: true`), koszt towaru pokrywa operator ze
  swojego salda u dostawcy.

## 2. Cashback

- Po zakupie klient otrzymuje **3% cashback** z powrotem na portfel Sunrise Pay.

## 3. Zasady sprzedawców

- Sprzedawca otrzymuje wypłatę **netto do portfela Sunrise Pay** (nie na konto
  bankowe).
- Prowizja platformy: **7,9%**.
- Rok darmowy od rejestracji, potem miesięczna subskrypcja za dostęp do
  Sunrise Pay. Akceptacja regulaminu Sunrise Pay wymagana przy rejestracji.

## 4. Dropship first-party (TeemDrop)

- Dotyczy **wyłącznie** produktów własnych Sunrise
  (`sellers.seller_type = 'sunrise'` + `offers.fulfillment_provider = 'teemdrop'`).
- Te pozycje: **tylko cashback**, bez prowizji MME/genealogii
  (`commission_model = 'cashback_only'`).
- Sprzedawcy zewnętrzni działają standardowo (własny fulfillment, model
  prowizyjny bez zmian). Koszyk mieszany rozdzielany per pozycja.
