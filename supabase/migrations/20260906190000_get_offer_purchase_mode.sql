-- 2026-09-06: get_offer usuwał purchase_mode i offer_type z atrybutów, przez co oferty wynajmu na dni (purchase_mode=daily)
-- renderowały się jak zwykły produkt („Kup teraz”, wysyłka, zwrot 14 dni) zamiast kalendarza rezerwacji.
-- purchase_mode/offer_type nie są danymi wrażliwymi — zostają. Ukryte nadal: vin, registration_number, kw_number, cashback_only.
CREATE OR REPLACE FUNCTION market.get_offer(p_id uuid)
 RETURNS TABLE(offer_id uuid, title text, description text, price_gross numeric, stock integer, status text, category text, category_slug text, seller text, seller_id uuid, avg_rating numeric, review_count integer, image_url text, attributes jsonb, fulfillment_provider text, delivery_eta text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'market', 'public'
AS $function$
  select o.id, o.title, o.description, o.price_gross, o.stock, o.status,
         c.name, c.slug, market.brand_label(o.fulfillment_provider), s.id,
         coalesce(round(avg(r.rating)::numeric,1),0), count(r.id)::int, o.image_url,
         ((coalesce(o.attributes,'{}'::jsonb)
            - 'vin' - 'registration_number' - 'kw_number' - 'cashback_only')
           || jsonb_build_object('has_vin', coalesce(nullif(o.attributes->>'vin',''),'') <> '')),
         o.fulfillment_provider, (o.attributes->>'delivery_eta')
  from market.offers o
  join market.categories c on c.id=o.category_id
  join market.sellers s on s.id=o.seller_id
  left join market.reviews r on r.offer_id=o.id
  where o.id=p_id and o.status='active'
  group by o.id, o.title, o.description, o.price_gross, o.stock, o.status, c.name, c.slug, s.id, o.image_url, o.attributes, o.fulfillment_provider;
$function$;
