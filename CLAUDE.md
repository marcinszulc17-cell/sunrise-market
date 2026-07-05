# Sunrise — reguły projektu (twarde inwarianty)

Te zasady obowiązują we WSZYSTKICH projektach ekosystemu Sunrise i mają
pierwszeństwo przy każdej zmianie kodu. Nie wolno ich naruszać ani obchodzić.

## 1. Płatność wyłącznie przez portfel Sunrise Pay (INWARIANT)

- Za towar/usługę klient płaci **wyłącznie z salda portfela Sunrise Pay**.
- **Nie ma** żadnej alternatywnej metody płatności za produkt (karta, BLIK,
  przelew, COD itd. — zabronione na etapie zakupu).
- Klient **musi najpierw doładować portfel**. Jeśli saldo < kwota zamówienia,
  zakup jest zablokowany, a UI kieruje do doładowania brakującej kwoty.
- **Stripe (i każdy inny zewnętrzny gateway) służy WYŁĄCZNIE do doładowania
  portfela**, nigdy do bezpośredniej zapłaty za produkt.
- Realizacja techniczna: checkout woła `pay_from_wallet`; brak środków → błąd
  `need_topup`. Koszyk pokazuje saldo i blokuje przycisk zapłaty, gdy za mało.
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
