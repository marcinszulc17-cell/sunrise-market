-- Universal commerce-mode filter for Sunrise Market.
-- purchase_mode remains private in returned attributes, but can be used as a search criterion.
-- Legacy offers without purchase_mode are treated as standard purchase offers.

create or replace function market.search_offers_v2(
  p_query text default null::text,
  p_category_slug text default null::text,
  p_price_min numeric default null::numeric,
  p_price_max numeric default null::numeric,
  p_sort text default null::text,
  p_limit integer default 40,
  p_filters jsonb default '{}'::jsonb
)
returns table(
  offer_id uuid,
  title text,
  price_gross numeric,
  category text,
  category_slug text,
  seller text,
  score real,
  rating numeric,
  reviews integer,
  image_url text,
  attributes jsonb
)
language sql
stable
security definer
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
  (coalesce(o.attributes,'{}'::jsonb) - 'vin' - 'registration_number' - 'kw_number' - 'offer_type' - 'cashback_only' - 'purchase_mode')
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
  and (not (p_filters ? 'location') or coalesce(o.attributes->>'location','') ilike '%'||(p_filters->>'location')||'%')
  and (not (p_filters ? 'area_min') or nullif(o.attributes->>'area_m2','')::numeric >= (p_filters->>'area_min')::numeric)
  and (not (p_filters ? 'area_max') or nullif(o.attributes->>'area_m2','')::numeric <= (p_filters->>'area_max')::numeric)
  and (not (p_filters ? 'rooms_min') or nullif(o.attributes->>'rooms','')::numeric >= (p_filters->>'rooms_min')::numeric)
  and (not (p_filters ? 'market_type') or lower(coalesce(o.attributes->>'market_type',''))=lower(p_filters->>'market_type'))
order by coalesce(o.is_test,false) asc,
  case when p_sort='cena_rosnaco' then o.price_gross end asc nulls last,
  case when p_sort='cena_malejaco' then o.price_gross end desc nulls last,
  case when p_sort='najnowsze' then o.created_at end desc nulls last,
  o.price_gross asc
limit p_limit
$function$;