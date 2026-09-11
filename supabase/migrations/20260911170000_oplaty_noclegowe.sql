-- Opłaty pobytowe: miejscowa (klimatyczna), za zwierzę, za osobę ponad limit w cenie.
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   oplaty_noclegowe_miejscowa_zwierze_dodatkowa_osoba, oplaty_w_katalogu_i_ustawieniach,
--   hold_v4_obsluga_wizyt
--
-- Wszystkie wchodzą do kwoty płaconej przy rezerwacji (fees_gross), a gość widzi
-- każdą osobno przed płatnością — market.booking_stay_quote liczy to samo, co
-- market.create_booking_hold_v4, więc podgląd nie rozjeżdża się z płatnością.
alter table market.booking_offers
  add column if not exists city_tax_per_person_night numeric not null default 0,
  add column if not exists pet_fee_per_night numeric not null default 0,
  add column if not exists base_guests integer,
  add column if not exists extra_person_fee_per_night numeric not null default 0;

alter table market.bookings
  add column if not exists with_pet boolean not null default false;
