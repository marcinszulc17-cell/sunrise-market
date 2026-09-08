-- Dział OZE: wszystkie 71 ofert siedziało w korzeniu „oze-i-energia", a 35 podkategorii świeciło pustkami
-- (zgłoszenie właściciela 2026-09-08). Rozdzielamy je po tytułach i naprawiamy slugi, w których slugify
-- gubiło literę „ł" (Ładowanie EV -> „-adowanie-ev").

-- 1. Slugi bez „ł" — poprawiamy tylko kategorie bez ofert, więc żaden działający link nie zmienia znaczenia.
update market.categories set slug = 'dziecko-pokoj-dzieciecy-lozeczka' where slug = 'dziecko-pokoj-dzieciecy-ozeczka';
update market.categories set slug = replace(slug, 'oze-i-energia-adowanie-ev', 'oze-i-energia-ladowanie-ev')
where slug like 'oze-i-energia-adowanie-ev%';
update market.categories set slug = replace(slug, 'ladowanie-ev-adowarki-', 'ladowanie-ev-ladowarki-')
where slug like 'oze-i-energia-ladowanie-ev-adowarki-%';

-- 2. Rozdział ofert po tytule. Kolejność WHEN ma znaczenie: zestaw PV + magazyn zostaje przy fotowoltaice,
--    bo produktem wiodącym jest instalacja, a magazyn jest dodatkiem.
with mapping as (
  select o.id,
    case
      when o.title ilike 'Falownik hybrydowy%'                        then 'oze-i-energia-fotowoltaika-inwertery'
      when o.title ilike 'Zestaw fotowoltaiczny%'                     then 'oze-i-energia-fotowoltaika'
      when o.title ilike 'Fotowoltaika%'                              then 'oze-i-energia-fotowoltaika'
      when o.title ilike 'Magazyn energii%falownik hybrydowy%'        then 'oze-i-energia-magazyny-energii-magazyny-hybrydowe'
      when o.title ilike 'Magazyn energii%'                           then 'oze-i-energia-magazyny-energii'
      when o.title ilike 'Klimatyzacja%'                              then 'oze-i-energia-klimatyzacja-split'
      when o.title ilike 'Kocioł na pellet%'                          then 'oze-i-energia-ogrzewanie-piece-pellet'
      when o.title ilike 'Piec zgazowujący drewno%'                   then 'oze-i-energia-ogrzewanie-piece-drewno'
      when o.title ilike 'Pompa ciepła%monoblok%'                     then 'oze-i-energia-pompy-ciepla-powietrzne'
      when o.title ilike '%Thermo HP%'                                then 'oze-i-energia-pompy-ciepla'
      when o.title ilike '%Charge AC%'                                then 'oze-i-energia-ladowanie-ev-ladowarki-ac'
      when o.title ilike '%Thermostat%' or o.title ilike '%Radiator Valve%'
        or o.title ilike 'Termostat pokojowy%'                        then 'oze-i-energia-smart-home'
      else null
    end as target_slug
  from market.offers o
  join market.categories c on c.id = o.category_id
  where c.slug = 'oze-i-energia'
)
update market.offers o
set category_id = t.id, updated_at = now()
from mapping m
join market.categories t on t.slug = m.target_slug
where o.id = m.id;
