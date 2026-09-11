-- Nocleg: cena za osobę za dobę obok ceny za cały obiekt.
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   nocleg_cena_za_osobe, nocleg_price_mode_rpc_v2,
--   public_catalog_max_guests_price_mode, search_stays_price_mode
--
-- price_mode = 'per_night'  → cena dotyczy całego obiektu za dobę (domyślnie)
-- price_mode = 'per_person' → cena dotyczy jednej osoby za dobę
-- bookings.guests zapisuje liczbę gości; bez niej nie dałoby się uczciwie
-- policzyć ani pokazać ceny przed płatnością.
alter table market.booking_offers
  add column if not exists price_mode text not null default 'per_night'
    check (price_mode in ('per_night','per_person'));

alter table market.bookings
  add column if not exists guests integer;
