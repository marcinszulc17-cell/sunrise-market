alter table market.promoted_offers
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

update market.promoted_offers po
set starts_at = coalesce(po.starts_at, po.created_at),
    ends_at = coalesce(po.ends_at, po.created_at + make_interval(days => greatest(1, coalesce(pp.days, 1))))
from market.promotion_purchases pp
where pp.id = po.source_purchase_id
  and po.pricing_code = 'highlight_day';

update market.promoted_offers
set starts_at = coalesce(starts_at, created_at)
where starts_at is null;

create index if not exists promoted_offers_active_window_idx
  on market.promoted_offers(status, starts_at, ends_at);

create or replace function market.home_promoted()
returns table(offer_id uuid, title text, price_gross numeric, category text, seller text, image_url text, rating numeric, reviews integer, kind text)
language sql
stable
security definer
set search_path = market, public
as $$
  select o.id, o.title, o.price_gross, c.name, market.brand_label(o.fulfillment_provider), o.image_url,
         coalesce(round(avg(r.rating)::numeric,1),0), count(r.id)::int,
         case when max(po.pricing_code)='highlight_day' then 'Wyróżnione' else 'Promowane' end
  from market.promoted_offers po
  join market.offers o on o.id=po.offer_id and o.status='active' and coalesce(o.is_test, false) = false
  join market.categories c on c.id=o.category_id
  join market.sellers s on s.id=o.seller_id
  left join market.reviews r on r.offer_id=o.id
  where po.status='active'
    and coalesce(po.starts_at, po.created_at) <= now()
    and (po.ends_at is null or po.ends_at > now())
  group by o.id, o.title, o.price_gross, c.name, o.fulfillment_provider, o.image_url
  limit 8;
$$;
