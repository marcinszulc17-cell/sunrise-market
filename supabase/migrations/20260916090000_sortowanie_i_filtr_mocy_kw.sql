-- Sortowanie i filtrowanie po mocy instalacji (kW).
-- Zgłoszenie właściciela 2026-09-16: w OZE nie dało się ułożyć instalacji
-- fotowoltaicznych od najmniejszej do największej. Moc siedziała wyłącznie w tytule,
-- więc lista szła alfabetycznie: 10,62 → 14,16 → 14,7 → 19,6 → 2,94 → 20,06 → 29,5.
--
-- Moc jest teraz w offers.attributes.power_kw (liczba kW), a pojemność magazynu
-- w storage_kwh. Wartości wypełnione jednorazowo z tytułów ofert (i z SKU falowników),
-- 53 z 65 aktywnych ofert w gałęzi oze-i-energia ma moc, 21 ma pojemność.
-- Oferty bez mocy (np. termostat) lądują na końcu listy, nie na początku.
--
-- Uwaga przy synchronizacji z MySunrise: jeśli sync nadpisuje attributes w całości,
-- power_kw trzeba przeliczyć ponownie — patrz zapytanie na dole pliku.

create or replace function market.search_offers(
  p_query text default null::text, p_category_slug text default null::text,
  p_price_min numeric default null::numeric, p_price_max numeric default null::numeric,
  p_sort text default null::text, p_limit integer default 40)
returns table(offer_id uuid, title text, price_gross numeric, category text, seller text,
              score real, rating numeric, reviews integer, image_url text)
language sql
stable security definer
set search_path to 'market', 'public', 'extensions'
as $function$
  with recursive sel as (
    select id from market.categories where slug = p_category_slug
    union all
    select c.id from market.categories c join sel on c.parent_id = sel.id
  ),
  rv as (select offer_id, avg(rating) r, count(*) n from market.reviews where offer_id is not null group by offer_id)
  select o.id, o.title, o.price_gross, c.name, market.brand_label(o.fulfillment_provider),
         case when p_query is null then 1.0 else similarity(o.title, p_query) end as score,
         coalesce(round(rv.r::numeric,1),0) as rating, coalesce(rv.n,0)::int as reviews, o.image_url
  from market.offers o
  join market.categories c on c.id = o.category_id
  join market.sellers s on s.id = o.seller_id
  left join rv on rv.offer_id = o.id
  where o.status = 'active'
    and (p_query is null
         or o.title ilike '%'||p_query||'%'
         or c.name ilike '%'||p_query||'%'
         or similarity(o.title, p_query) > 0.34)
    and (p_category_slug is null or o.category_id in (select id from sel))
    and (p_price_min is null or o.price_gross >= p_price_min)
    and (p_price_max is null or o.price_gross <= p_price_max)
  order by
    coalesce(o.is_test, false) asc,
    case when p_sort in ('moc_rosnaco','moc_malejaco')
         then (nullif(o.attributes->>'power_kw','') is null) end asc,
    case when p_sort='moc_rosnaco' then nullif(o.attributes->>'power_kw','')::numeric end asc nulls last,
    case when p_sort='moc_malejaco' then nullif(o.attributes->>'power_kw','')::numeric end desc nulls last,
    case when p_sort='cena_rosnaco' then o.price_gross end asc nulls last,
    case when p_sort='cena_malejaco' then o.price_gross end desc nulls last,
    case when p_sort='oceny' then coalesce(rv.r,0) end desc nulls last,
    case when p_sort='oceny' then coalesce(rv.n,0) end desc nulls last,
    case when p_sort='najnowsze' then o.created_at end desc nulls last,
    case when (p_sort is null or p_sort='trafnosc') and p_query is not null and o.title ilike '%'||p_query||'%' then 0
         when (p_sort is null or p_sort='trafnosc') and p_query is not null and c.name ilike '%'||p_query||'%' then 1
         else 2 end asc,
    case when p_sort is null or p_sort='trafnosc' then (case when p_query is null then 1.0 else similarity(o.title, p_query) end) end desc nulls last,
    o.price_gross asc
  limit p_limit;
$function$;

create or replace function market.search_offers_v2(
  p_query text default null::text, p_category_slug text default null::text,
  p_price_min numeric default null::numeric, p_price_max numeric default null::numeric,
  p_sort text default null::text, p_limit integer default 40, p_filters jsonb default '{}'::jsonb)
returns table(offer_id uuid, title text, price_gross numeric, category text, category_slug text,
              seller text, score real, rating numeric, reviews integer, image_url text,
              attributes jsonb, created_at timestamp with time zone, views integer)
language sql
stable security definer
set search_path to 'market', 'public', 'extensions'
as $function$
with recursive sel as (
  select id from market.categories where slug=p_category_slug
  union all select c.id from market.categories c join sel on c.parent_id=sel.id
), rv as (
  select offer_id,avg(rating) r,count(*) n from market.reviews where offer_id is not null group by offer_id
)
select o.id,o.title,o.price_gross,c.name,c.slug,market.brand_label(o.fulfillment_provider),
  case when p_query is null then 1.0 else similarity(o.title,p_query) end,
  coalesce(round(rv.r::numeric,1),0),coalesce(rv.n,0)::int,o.image_url,
  (coalesce(o.attributes,'{}'::jsonb) - 'vin' - 'registration_number' - 'kw_number' - 'offer_type' - 'cashback_only'),
  o.created_at, o.view_count
from market.offers o
join market.categories c on c.id=o.category_id
join market.sellers s on s.id=o.seller_id
left join rv on rv.offer_id=o.id
where o.status='active'
  and (p_query is null or o.title ilike '%'||p_query||'%' or c.name ilike '%'||p_query||'%' or similarity(o.title,p_query)>0.34)
  and (p_category_slug is null or o.category_id in (select id from sel))
  and (p_price_min is null or o.price_gross>=p_price_min)
  and (p_price_max is null or o.price_gross<=p_price_max)
  and (not (p_filters ? 'purchase_mode') or coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase') = p_filters->>'purchase_mode')
  and (not (p_filters ? 'brand') or lower(coalesce(o.attributes->>'brand',''))=lower(p_filters->>'brand'))
  and (not (p_filters ? 'model') or coalesce(o.attributes->>'model','') ilike '%'||(p_filters->>'model')||'%')
  and (not (p_filters ? 'fuel') or lower(coalesce(o.attributes->>'fuel',''))=lower(p_filters->>'fuel'))
  and (not (p_filters ? 'gearbox') or lower(coalesce(o.attributes->>'gearbox',''))=lower(p_filters->>'gearbox'))
  and (not (p_filters ? 'year_min') or nullif(o.attributes->>'year','')::numeric >= (p_filters->>'year_min')::numeric)
  and (not (p_filters ? 'year_max') or nullif(o.attributes->>'year','')::numeric <= (p_filters->>'year_max')::numeric)
  and (not (p_filters ? 'mileage_max') or nullif(coalesce(o.attributes->>'mileage_km',o.attributes->>'mileage'),'')::numeric <= (p_filters->>'mileage_max')::numeric)
  and (not (p_filters ? 'location') or market.offer_serves(o.attributes, p_filters->>'location'))
  and (not (p_filters ? 'area_min') or nullif(o.attributes->>'area_m2','')::numeric >= (p_filters->>'area_min')::numeric)
  and (not (p_filters ? 'area_max') or nullif(o.attributes->>'area_m2','')::numeric <= (p_filters->>'area_max')::numeric)
  and (not (p_filters ? 'rooms_min') or nullif(o.attributes->>'rooms','')::numeric >= (p_filters->>'rooms_min')::numeric)
  and (not (p_filters ? 'market_type') or lower(coalesce(o.attributes->>'market_type',''))=lower(p_filters->>'market_type'))
  and (not (p_filters ? 'power_min') or nullif(o.attributes->>'power_kw','')::numeric >= (p_filters->>'power_min')::numeric)
  and (not (p_filters ? 'power_max') or nullif(o.attributes->>'power_kw','')::numeric <= (p_filters->>'power_max')::numeric)
order by coalesce(o.is_test,false) asc,
  case when p_sort in ('moc_rosnaco','moc_malejaco')
       then (nullif(o.attributes->>'power_kw','') is null) end asc,
  case when p_sort='moc_rosnaco' then nullif(o.attributes->>'power_kw','')::numeric end asc nulls last,
  case when p_sort='moc_malejaco' then nullif(o.attributes->>'power_kw','')::numeric end desc nulls last,
  case when p_sort='cena_rosnaco' then o.price_gross end asc nulls last,
  case when p_sort='cena_malejaco' then o.price_gross end desc nulls last,
  case when p_sort='najnowsze' then o.created_at end desc nulls last,
  case when p_sort='popularne' then o.view_count end desc nulls last,
  o.price_gross asc
limit p_limit
$function$;

-- Filtr „Moc od–do" i „Pojemność magazynu od–do". Market renderuje typ 'number'
-- jako parę pól od/do, więc wystarczy wpis w słowniku atrybutów kategorii.
insert into market.category_attributes (category_id, key, label, data_type, required, options)
select c.id, v.key, v.label, v.data_type, false, null::jsonb
from market.categories c
cross join (values
  ('power_kw',    'Moc (kW)',                'number'),
  ('storage_kwh', 'Pojemność magazynu (kWh)','number')
) as v(key,label,data_type)
where c.slug in ('oze-i-energia','oze-i-energia-fotowoltaika','oze-i-energia-magazyny-energii',
                 'oze-i-energia-pompy-ciepla','oze-i-energia-klimatyzacja','oze-i-energia-ogrzewanie')
  and not exists (select 1 from market.category_attributes a where a.category_id=c.id and a.key=v.key);

-- Przeliczenie power_kw / storage_kwh z tytułów (do powtórzenia po imporcie nowych ofert):
--
-- with dane as (
--   select o.id,
--     coalesce(
--       replace((regexp_match(o.title,'([0-9]+(?:[.,][0-9]+)?)\s*kW(?!h)'))[1],',','.')::numeric,
--       (regexp_match(coalesce(o.attributes->>'mysunrise_sku',''),'INV-DEYE-([0-9]+)K'))[1]::numeric
--     ) as kwp,
--     (regexp_match(o.title,'([0-9]+(?:[.,][0-9]+)?)\s*kWh'))[1]::numeric as kwh
--   from market.offers o join market.categories c on c.id=o.category_id
--   where c.slug like 'oze-i-energia%' and o.status='active'
-- )
-- update market.offers o
-- set attributes = o.attributes
--       || case when d.kwp is not null then jsonb_build_object('power_kw', d.kwp) else '{}'::jsonb end
--       || case when d.kwh is not null then jsonb_build_object('storage_kwh', d.kwh) else '{}'::jsonb end
-- from dane d where o.id = d.id;
