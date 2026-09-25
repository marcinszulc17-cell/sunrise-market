-- Liczniki kafli na stronie głównej muszą pokazywać to samo, co strona pod kafelkiem.
-- Zgłoszenie właściciela 2026-09-25: „pokazuje, że w noclegach jest oferta, a jej nie ma".
--
-- Dwa rozjazdy:
--  1) klucz `rezerwacje` sumuje usługi na termin I wynajem na dni, a kafel prowadził
--     na ?tryb=appointment (tylko usługi) — licznik mówił „1 oferta", lista była pusta.
--     Naprawione po stronie frontu: adres to teraz ?tryb=rezerwacje i pyta o oba tryby.
--  2) klucz `zakupy` wykluczał Motoryzację, Usługi, OZE i Ogłoszenia, ale kafel prowadzi
--     na /sklep — pełny katalog, który w pasku działów pokazuje „Wszystkie (700)".
--     Licznik mówił 602. Teraz liczy dokładnie to, co /sklep pokazuje.
--
-- Funkcja nie była wcześniej w repozytorium (istniała tylko w bazie) — ta migracja
-- zaciąga ją do repo w całości, żeby kolejna zmiana nie działała po omacku.
create or replace function market.liczby_dzialow()
returns table(klucz text, ofert bigint)
language sql
stable
security definer
set search_path to 'market', 'public'
as $function$
  with recursive korzenie as (
    select id, slug as root_slug from market.categories where parent_id is null
    union all
    select c.id, k.root_slug from market.categories c join korzenie k on c.parent_id = k.id
  ),
  aktywne as (
    select o.id, k.root_slug, coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase') tryb
    from market.offers o join korzenie k on k.id = o.category_id
    where o.status = 'active' and coalesce(o.is_test,false) = false
  )
  -- /sklep pokazuje CAŁY katalog (pasek działów: „Wszystkie"), więc kafel Zakupy liczy tyle samo.
  select 'zakupy'::text, count(*) from aktywne
  union all select 'rezerwacje', count(*) from aktywne where tryb in ('appointment','daily')
  union all select 'nieruchomosci', count(*) from aktywne where root_slug = 'nieruchomosci'
  union all select 'motoryzacja', count(*) from aktywne where root_slug = 'motoryzacja'
  union all select 'uslugi', count(*) from aktywne where root_slug = 'uslugi-i-reklama'
  union all select 'oze', count(*) from aktywne where root_slug = 'oze-i-energia'
  union all select 'praca', count(*) from aktywne where root_slug = 'ogloszenia-lokalne'
  union all select 'noclegi', count(*) from aktywne where root_slug = 'noclegi';
$function$;
