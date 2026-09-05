-- 2026-09-06 (decyzja właściciela): marki własne Sunrise są dostępne w promieniu ≥200 km od Nowego Tomyśla.
--  • market.service_cities — miasta obszaru działania (SEO: /oze/<slug>, filtr regionu/miasta).
--  • Oferty Sunrise: attributes.service_radius_km = 200, service_lat/lon = Nowy Tomyśl.
--  • search_offers_v2: filtr location trafia także oferty z zasięgiem, gdy szukane miasto/województwo leży w promieniu.
--  • market.city_offers(p_slug, p_limit) — oferty dla strony miasta (anon).
create table if not exists market.service_cities (
  slug text primary key, name text not null, region text not null, lat double precision not null, lon double precision not null
);
insert into market.service_cities(slug,name,region,lat,lon) values
('poznan','Poznań','wielkopolskie',52.4064,16.9252),
('zielona-gora','Zielona Góra','lubuskie',51.9356,15.5062),
('gorzow-wielkopolski','Gorzów Wielkopolski','lubuskie',52.7368,15.2288),
('leszno','Leszno','wielkopolskie',51.8418,16.575),
('wroclaw','Wrocław','dolnośląskie',51.1079,17.0385),
('bydgoszcz','Bydgoszcz','kujawsko-pomorskie',53.1235,18.0084),
('torun','Toruń','kujawsko-pomorskie',53.0138,18.5984),
('szczecin','Szczecin','zachodniopomorskie',53.4285,14.5528),
('kalisz','Kalisz','wielkopolskie',51.7611,18.091),
('konin','Konin','wielkopolskie',52.223,18.2512),
('pila','Piła','wielkopolskie',53.151,16.738),
('legnica','Legnica','dolnośląskie',51.207,16.1553),
('glogow','Głogów','dolnośląskie',51.6636,16.0845),
('gniezno','Gniezno','wielkopolskie',52.5349,17.5826),
('ostrow-wielkopolski','Ostrów Wielkopolski','wielkopolskie',51.6549,17.8104),
('swiebodzin','Świebodzin','lubuskie',52.2477,15.533),
('nowy-tomysl','Nowy Tomyśl','wielkopolskie',52.3181,16.1283),
('grodzisk-wielkopolski','Grodzisk Wielkopolski','wielkopolskie',52.227,16.364),
('wolsztyn','Wolsztyn','wielkopolskie',52.117,16.115),
('miedzyrzecz','Międzyrzecz','lubuskie',52.4447,15.5787),
('szamotuly','Szamotuły','wielkopolskie',52.612,16.582),
('srem','Śrem','wielkopolskie',52.0885,17.015),
('koscian','Kościan','wielkopolskie',52.087,16.644),
('lubin','Lubin','dolnośląskie',51.4,16.201),
('nowa-sol','Nowa Sól','lubuskie',51.803,15.717),
('zary','Żary','lubuskie',51.642,15.137),
('inowroclaw','Inowrocław','kujawsko-pomorskie',52.798,18.261)
on conflict (slug) do update set name=excluded.name, region=excluded.region, lat=excluded.lat, lon=excluded.lon;
grant select on market.service_cities to anon, authenticated, service_role;

create or replace function market.km_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2*6371*asin(sqrt(sin(radians(lat2-lat1)/2)^2 + cos(radians(lat1))*cos(radians(lat2))*sin(radians(lon2-lon1)/2)^2));
$$;

update market.offers o set attributes = coalesce(o.attributes,'{}'::jsonb) || '{"service_radius_km":200,"service_lat":52.3181,"service_lon":16.1283}'::jsonb, updated_at = now()
from market.sellers s where s.id = o.seller_id and s.seller_type = 'sunrise' and (o.attributes->>'service_radius_km') is null;

-- Czy oferta obsługuje lokalizację (tekst: miasto lub województwo)
create or replace function market.offer_serves(p_attrs jsonb, p_loc text)
returns boolean language sql stable as $$
  select coalesce(p_attrs->>'location','') ilike '%'||p_loc||'%'
      or (
        (p_attrs->>'service_radius_km') is not null and exists (
          select 1 from market.service_cities c
          where (c.name ilike '%'||p_loc||'%' or c.region ilike '%'||p_loc||'%')
            and market.km_between((p_attrs->>'service_lat')::float8,(p_attrs->>'service_lon')::float8,c.lat,c.lon) <= (p_attrs->>'service_radius_km')::float8
        )
      );
$$;
drop function if exists market.search_offers_v2(text,text,numeric,numeric,text,integer,jsonb);
create function market.search_offers_v2(p_query text default null, p_category_slug text default null, p_price_min numeric default null, p_price_max numeric default null, p_sort text default null, p_limit integer default 40, p_filters jsonb default '{}'::jsonb)
returns table(offer_id uuid, title text, price_gross numeric, category text, category_slug text, seller text, score real, rating numeric, reviews integer, image_url text, attributes jsonb, created_at timestamptz, views integer)
language sql stable security definer set search_path to 'market','public','extensions' as $$
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
order by coalesce(o.is_test,false) asc,
  case when p_sort='cena_rosnaco' then o.price_gross end asc nulls last,
  case when p_sort='cena_malejaco' then o.price_gross end desc nulls last,
  case when p_sort='najnowsze' then o.created_at end desc nulls last,
  case when p_sort='popularne' then o.view_count end desc nulls last,
  o.price_gross asc
limit p_limit
$$;
grant execute on function market.search_offers_v2(text,text,numeric,numeric,text,integer,jsonb) to anon, authenticated, service_role;

-- Oferty na stronę miasta (SEO): OZE i Energia + usługi Sunrise obsługujące dane miasto
create or replace function market.city_offers(p_slug text, p_limit integer default 24)
returns table(offer_id uuid, title text, price_gross numeric, category text, category_slug text, image_url text, created_at timestamptz, location text)
language sql stable security definer set search_path to 'market','public' as $$
  select o.id, o.title, o.price_gross, c.name, c.slug, o.image_url, o.created_at, o.attributes->>'location'
  from market.offers o join market.categories c on c.id = o.category_id
  join market.service_cities sc on sc.slug = p_slug
  where o.status = 'active' and coalesce(o.is_test,false) = false
    and market.offer_serves(o.attributes, sc.name)
  order by (c.slug like 'oze%') desc, o.view_count desc, o.created_at desc
  limit greatest(1, least(coalesce(p_limit,24), 100));
$$;
grant execute on function market.city_offers(text,integer), market.offer_serves(jsonb,text), market.km_between(float8,float8,float8,float8) to anon, authenticated, service_role;
