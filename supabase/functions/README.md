# Edge Functions — Sunrise Market

Projekt Supabase: `ihehncaaokbwbdqdztna`. Stan wg `list_edge_functions` (2026-09-05). Katalogi dodane z wdrożonego źródła (nie było ich w repo) oznaczono `*`.

Legenda wywołania: **front** = `supabase.functions.invoke` z `src/`, **cron** = pg_cron/`net.http_post` lub nagłówek `X-Cron-Secret`/`x-sync-secret`, **webhook** = zewnętrzny system, **op** = panel operatora (front, tylko `ami_operator`), **wewn.** = wołane przez inną funkcję / harness, **410** = wyłączona (stub).

| Funkcja | Co robi | verify_jwt | Wywołanie |
|---|---|---|---|
| `ad-buy` * | Zakup reklamy przez sprzedawcę z portfela Sunrise Pay, tworzy `ad_campaigns`. | true | front |
| `booking-cancel-refund` | Anulowanie rezerwacji i zwrot Stripe (`seller_booking_refund_prepare`/`finalize`). | true | front |
| `booking-deposit-action` | Decyzja o kaucji (zwrot/częściowy/zatrzymanie) po protokole zdawczym. | true | front |
| `booking-mailer` | Wysyła zakolejkowane maile (rezerwacje, zamówienia) przez Resend. | true | cron |
| `booking-protocol` | Protokoły wydania/zwrotu, zdjęcia, odpowiedź kupującego. | true | front |
| `booking-refund` * | Stub 410 `deprecated_endpoint`. | true | 410 |
| `booking-refund-action` | Finalizacja zwrotu rezerwacji (Stripe refund + `booking_refund_finalize`). | true | front |
| `cancel-order-reservation` | Zwalnia rezerwację stanu nieopłaconego zamówienia (`release_unpaid_order`). | true | front |
| `cancel-unpaid-order` | Anuluje nieopłacone zamówienie i weryfikuje sesję Stripe. | true | front |
| `checkout` | Tworzy zamówienie i płatność (Stripe Checkout / portfel Sunrise Pay). | false | front |
| `cj-admin` * | Operator: lista draftów, statystyki katalogu, aktywacja ofert (CJ/Eprolo/TeemDrop). | true | op |
| `cj-debug` * | Diagnostyka `product/query` CJ (pole `productVideo`). | true | op |
| `cj-enrich` * | Wzbogaca oferty CJ: galerie, warianty, specyfikacja, opis PL, cena rynkowa. | true | op |
| `cj-forward-order` * | Przekazuje opłacone zamówienie do CJ Dropshipping (`createOrderV2`). | true | op |
| `cj-import-feed` * | Import produktów z CJ (`product/list`) jako oferty draft. | true | op |
| `cj-import-test` * | Stub 410 — wyłączony seeder CJ. | true | 410 |
| `connect-onboard` | Onboarding sprzedawcy w Stripe Connect (account + accountLink). | true | front |
| `courier-track-confirm` * | Kupujący potwierdza doręczenie; sprawdza status w GlobKurier. | true | front |
| `courier-track-poll` | Cykliczne odpytywanie GlobKurier o doręczenia (`x-cron-secret`). | false | cron |
| `customer-access` | Cache dostępu klienta (`customer_access_cache`). | true | front |
| `customer-consents` | Zgody klienta pobierane z MySunrise + akceptacja regulaminu sprzedawcy. | true | front |
| `diag-env-names` * | Stub 410 `gone` — zakończona diagnostyka. | true | 410 |
| `energy-referral` | Link polecający Sunrise Energy (kod ambasadora / Family Club). | true | front |
| `enrich-descriptions` * | Polska nazwa + długi opis (Claude) dla ofert first-party; RPC `claim_enrich_batch`. | false | wewn. (`x-bridge-token`) |
| `eprolo-forward-order` * | Przekazuje opłacone zamówienie do Eprolo (`add_order.html`). | true | op |
| `eprolo-import` * | Import katalogu Eprolo jako oferty draft. | true | op |
| `gen-description` * | Generuje/poprawia opis oferty (OpenAI, fallback szablon). | true | front |
| `globkurier` * | Integracja GlobKurier: wycena, zakup etykiety z portfela, pobranie etykiety, tracking. | true | front |
| `ingest-gallery` * | Przyjmuje galerie zdjęć TeemDrop z przeglądarki i zapisuje do `offer_images`. | false | wewn. (harness) |
| `member-status` * | Status klubu (Family/Ambassador) z MySunrise `ambassador-status`. | false | front |
| `mysunrise-sync` | Sync produktów MySunrise → `market.offers` (`x-sync-secret`). | false | cron |
| `nip-lookup` * | Dane firmy po NIP z Białej Listy MF. | false | front |
| `partner-dashboard` * | Panel partnera: oferty, sprzedaż, członkostwo, dane ambasadora. | true | front |
| `payout-run` | Wypłaty sprzedawców przez Stripe (`X-Cron-Secret`). | false | cron |
| `promote-offer` | Promowanie oferty (zakup z portfela Sunrise Pay). | true | front |
| `ref-attribute` * | Przypina klienta do ambasadora po kodzie (MySunrise `mkt-referral`). | true | front |
| `repair-offer-images` * | Konwersja zdjęć HEIC → JPG w Storage; ma `deno.json` (import map npm). | true | front |
| `reprice-market` * | Wycena ofert dropship pod rynek PL (Claude), RPC `claim_reprice_batch`. | false | wewn. (`x-token`) |
| `retry-seller-settlements` | Ponawia nieudane rozliczenia sprzedawców. | false | cron |
| `sales-documents` | Dokumenty sprzedaży: lista, upload, pobranie. | true | front |
| `seller-withdraw` | Wypłata sprzedawcy na żądanie (lustro portfela + transfer Stripe). | true | front |
| `smart-subscribe` * | Zakup abonamentu „Sunrise Smart” z portfela. | true | front |
| `sso-handoff` * | SSO z MySunrise: weryfikuje token huba, tworzy konto, zwraca magiclink `token_hash`. | false | front |
| `sso-login` * | Logowanie hasłem MySunrise; tworzy/aktualizuje konto w Markecie. | false | front |
| `sso-register` | Rejestracja klienta (SSO z MySunrise). | true | front |
| `stripe-webhook` | Webhook Stripe: oznacza `paid`, nalicza rozliczenia. | false | webhook |
| `suri-commerce` * | Asystentka zakupowa Suri (Claude) + historia rozmowy. | false | front |
| `teemdrop-bridge` | Wypycha zakolejkowane zamówienia dropship do WooCommerce. | false | cron / op |
| `teemdrop-catalog-pull` * | Import katalogu TeemDrop (search API) z kategoryzacją AI. | false | wewn. (`x-token`) |
| `trade-partner-renew` | Odnowienie członkostwa Partnera Handlowego (Stripe Checkout). | true | front |
| `verify-checkout` | Płatność za Sunrise Verify (Stripe Checkout). | true | front |
| `verify-run` * | Worker weryfikacji pojazdu/nieruchomości (NHTSA, CEPiK, GUGiK). | true | wewn. (`verify-sweeper`) / front |
| `verify-status` | Status żądania weryfikacji, odpala `verify-run`. | true | front |
| `verify-sweeper` | Zamiata opłacone weryfikacje i uruchamia `verify-run`. | false | cron |
| `wallet-balance` | Saldo portfela Sunrise Pay klienta. | true | front |
| `wallet-redeem-points` | Wymiana punktów na saldo (`pay-convert-points`). | true | front |
| `wallet-seller-balance` | Saldo sprzedawcy (`pay-seller-balance`). | true | front |
| `wallet-topup` | Doładowanie portfela kartą (Stripe Checkout). | true | front |
| `woo-catalog-pull` * | Import produktów WooCommerce/TeemDrop z wyceną AI, galeriami, wariantami. | false | wewn. (`x-bridge-token`) |
| `woo-status-sync` * | Webhook WooCommerce `order.updated` (HMAC) → status + tracking zamówienia. | false | webhook |

Uwagi: `repair-offer-images` jako jedyna ma `import_map: true` (`deno.json`). Funkcje `ad-buy`, `smart-subscribe`, `member-status`, `ref-attribute`, `globkurier`, `sso-login`, `sso-handoff` mają zahardkodowane fallbacki tokenu/klucza anon MySunrise w kodzie.
