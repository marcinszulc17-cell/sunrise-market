-- Keep full VIN private while exposing only a boolean availability flag.
create or replace function market.get_offer(p_id uuid)
returns table(
  offer_id uuid, title text, description text, price_gross numeric, stock integer, status text,
  category text, category_slug text, seller text, seller_id uuid, avg_rating numeric,
  review_count integer, image_url text, attributes jsonb, fulfillment_provider text,
  delivery_eta text, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select o.id, o.title, o.description, o.price_gross, o.stock, o.status,
         c.name, c.slug, market.brand_label(o.fulfillment_provider), s.id,
         coalesce(round(avg(r.rating)::numeric,1),0), count(r.id)::int, o.image_url,
         ((market.atrybuty_publiczne(o.attributes)
            - 'vin' - 'registration_number' - 'kw_number' - 'cashback_only')
           || jsonb_build_object(
                'has_vin',
                exists(
                  select 1
                  from market.offer_private_data opd
                  where opd.offer_id=o.id
                    and coalesce(nullif(opd.vin,''),'') <> ''
                )
                or coalesce(nullif(o.attributes->>'vin',''),'') <> ''
              )),
         o.fulfillment_provider, (o.attributes->>'delivery_eta'), o.created_at
  from market.offers o
  join market.categories c on c.id=o.category_id
  join market.sellers s on s.id=o.seller_id
  left join market.reviews r on r.offer_id=o.id
  where o.id=p_id and o.status='active'
  group by o.id, o.title, o.description, o.price_gross, o.stock, o.status,
           c.name, c.slug, s.id, o.image_url, o.attributes, o.fulfillment_provider, o.created_at;
$$;
