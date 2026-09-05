-- 2026-09-06: „x godz. temu” na kartach + licznik wyświetleń ogłoszeń + statystyki ofert sprzedawcy (decyzja właściciela).
--  • offers.view_count — liczony dla każdego (także gości) przez market.count_offer_view(p_offer); track_view bez zmian (rekomendacje).
--  • search_offers_v2 / recommended_offers / my_watchlist zwracają created_at (+ views).
--  • seller_offer_stats() — tabela w Panelu Partnera: ogłoszenie, kategoria, cena, wyświetlenia, ulubione, status.

alter table market.offers add column if not exists view_count integer not null default 0;

create or replace function market.count_offer_view(p_offer uuid)
returns void language sql security definer set search_path to 'market','public' as $$
  update market.offers set view_count = view_count + 1 where id = p_offer and status = 'active';
$$;
revoke all on function market.count_offer_view(uuid) from public;
grant execute on function market.count_offer_view(uuid) to anon, authenticated, service_role;

-- search_offers_v2: zmiana typu zwracanego → drop + create (te same parametry, sygnatura bez zmian dla klienta)
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
  and (not (p_filters ? 'location') or coalesce(o.attributes->>'location','') ilike '%'||(p_filters->>'location')||'%')
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

create or replace function market.recommended_offers(p_limit integer default 12)
returns setof jsonb language plpgsql security definer set search_path to 'public','market' as $$
declare v_uid uuid := auth.uid();
begin
  return query
  with pref as (
    select category_id, count(*) w from (
      select category_id from market.product_views where user_id=v_uid and viewed_at > now()-interval '60 days'
      union all
      select of2.category_id from market.orders o join market.order_items oi on oi.order_id=o.id
             join market.offers of2 on of2.id=oi.offer_id where o.buyer_id=v_uid
    ) x where category_id is not null group by category_id
  ),
  bought as (select oi.offer_id from market.orders o join market.order_items oi on oi.order_id=o.id where o.buyer_id=v_uid)
  select to_jsonb(r) from (
    select o.id as offer_id, o.title, o.price_gross, o.image_url, c.name as category, market.brand_label(o.fulfillment_provider) as seller,
           coalesce(round(avg(rv.rating)::numeric,1),0) as rating, count(rv.id)::int as reviews,
           o.created_at, o.view_count as views, o.attributes->>'location' as location
    from market.offers o
    join market.categories c on c.id=o.category_id
    join market.sellers s on s.id=o.seller_id
    left join market.reviews rv on rv.offer_id=o.id
    left join pref p on p.category_id=o.category_id
    where o.status='active'
      and coalesce(o.is_test, false) = false
      and o.id not in (select offer_id from bought)
    group by o.id, o.title, o.price_gross, o.image_url, c.name, o.fulfillment_provider, coalesce(p.w,0), o.created_at, o.view_count, o.attributes
    order by coalesce(max(p.w),0) desc, count(rv.id) desc, o.created_at desc
    limit greatest(1, least(coalesce(p_limit,12), 24))
  ) r;
end $$;

create or replace function market.my_watchlist()
returns setof jsonb language plpgsql security definer set search_path to 'market','public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query select to_jsonb(r) from (
    select o.id as offer_id,o.title,o.price_gross,o.image_url,c.name as category,s.legal_name as seller,w.price_at_add,
      (o.price_gross<w.price_at_add) as price_dropped,w.notify_drop,
      case when o.price_gross<w.price_at_add then (w.price_at_add-o.price_gross) else 0 end as price_drop_amount,
      coalesce(round(avg(rv.rating)::numeric,1),0) as rating,count(rv.id)::int as reviews,
      o.created_at, w.created_at as added_at, o.attributes->>'location' as location
    from market.watchlist w join market.offers o on o.id=w.offer_id join market.categories c on c.id=o.category_id
    join market.sellers s on s.id=o.seller_id left join market.reviews rv on rv.offer_id=o.id
    where w.user_id=v_uid and o.status='active'
    group by o.id,o.title,o.price_gross,o.image_url,c.name,s.legal_name,w.price_at_add,w.notify_drop,w.created_at,o.created_at,o.attributes
    order by w.created_at desc) r;
end $$;

-- Statystyki ofert sprzedawcy (tabela w Panelu Partnera)
create or replace function market.seller_offer_stats()
returns table(offer_id uuid, title text, image_url text, category text, price_gross numeric, status text, views integer, favorites integer, created_at timestamptz, purchase_mode text)
language sql stable security definer set search_path to '' as $$
  select o.id, o.title, o.image_url, c.name, o.price_gross, o.status, o.view_count,
         (select count(*)::int from market.watchlist w where w.offer_id = o.id),
         o.created_at, coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase')
  from market.offers o join market.categories c on c.id = o.category_id
  where o.seller_id = market.current_seller_id()
  order by o.created_at desc;
$$;
revoke all on function market.seller_offer_stats() from public;
grant execute on function market.seller_offer_stats() to authenticated, service_role;
