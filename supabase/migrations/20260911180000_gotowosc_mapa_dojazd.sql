-- Gotowość oferty noclegowej przed publikacją + mapa i dojazd.
-- Zastosowane na produkcji 2026-09-11 jako migracje:
--   gotowosc_oferty_noclegowej, nocleg_mapa_i_dojazd
--
-- configure_booking_offer blokuje publikację noclegu poniżej 5 zdjęć i 200 znaków opisu
-- (blokada po stronie bazy, żeby nie dało się jej ominąć innym ekranem).
-- Współrzędne podaje właściciel — nie geokodujemy; pinezka pokazuje okolicę, nie budynek.
alter table market.booking_offers
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists directions text;
