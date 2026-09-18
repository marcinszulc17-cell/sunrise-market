-- Rynek pracy w Sunrise Market dziala w obie strony i jest bezplatny.
-- Zastosowane wczesniej na projekcie ihehncaaokbwbdqdztna jako migracje:
--   ogloszenia_o_prace_dla_kazdego_i_szukam_pracy
--   ogloszenia_lokalne_bez_konta_sprzedawcy
--   ogloszeniodawca_jako_osoba_prywatna_w_badge
--   status_partnera_konto_ogloszeniodawcy_nie_sprzedaje
-- Ten plik jest zapisem tego stanu w repozytorium.

-- 1. Nowy typ konta: ogloszeniodawca. Powstaje automatycznie przy pierwszym
--    bezplatnym ogloszeniu i NIE daje prawa do wystawiania platnych ofert.
alter table market.sellers drop constraint if exists sellers_seller_type_check;
alter table market.sellers add constraint sellers_seller_type_check
  check (seller_type = any (array['business','individual','private_partner','sunrise','ogloszenia']));

-- 2. Kategorie: obie strony rynku pracy.
update market.categories set name = 'Oferty pracy' where slug = 'ogloszenia-lokalne-praca';
insert into market.categories (slug, name, parent_id)
select 'ogloszenia-lokalne-szukam-pracy', 'Szukam pracy', id
from market.categories where slug = 'ogloszenia-lokalne'
on conflict (slug) do nothing;

-- 3. Pracodawca odpisuje kandydatowi: nowy typ interakcji 'job_offer'
--    (odwrotny kierunek niz 'application').
-- 4. create_offer_v2: ogloszenia lokalne bez konta sprzedawcy, z tagiem job_side.
-- 5. offer_seller_badge: ogloszeniodawca to osoba prywatna, bez praw konsumenta.
-- 6. my_trade_partner_status: can_sell = false dla konta ogloszeniodawcy.
-- Pelne cialo tych funkcji zyje w bazie (patrz migracje wymienione w naglowku).
