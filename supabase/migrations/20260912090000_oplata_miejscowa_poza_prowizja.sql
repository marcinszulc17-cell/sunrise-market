-- Decyzja właściciela 2026-09-12: PROWIZJA PLATFORMY NIE OBEJMUJE OPŁATY MIEJSCOWEJ.
-- Opłata klimatyczna to danina dla gminy, którą właściciel obiektu tylko pobiera
-- i odprowadza — nie jest jego przychodem, więc nie ma od czego brać prowizji.
-- Trafia do niego w całości.
--
-- Zastosowane na produkcji jako migracja `oplata_miejscowa_poza_prowizja`:
--   • bookings.city_tax_gross — kwota opłaty zapisana osobno przy blokadzie terminu,
--   • create_booking_hold_v4 — wypełnia to pole,
--   • checkout_booking — prowizja od (amount_gross − city_tax_gross), a wypłata
--     właściciela to amount_gross − prowizja, czyli cała opłata miejscowa u niego.
alter table market.bookings
  add column if not exists city_tax_gross numeric not null default 0;
