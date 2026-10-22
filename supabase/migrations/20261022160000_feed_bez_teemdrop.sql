-- Plik produktowy (Google Merchant Center) bez towaru TeemDrop: dostawa 15–25 dni z Chin
-- obniża ocenę sklepu w Google (decyzja właściciela 2026-10-22). Oferty zostają w sklepie,
-- znikają tylko z /feed.xml.
create or replace function market.feed_ofert(p_limit integer default 5000)
 returns table(offer_id uuid, title text, description text, price_gross numeric, stock integer, category text, category_slug text, seller text, image_url text, attributes jsonb, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'market', 'public'
as $function$
  select o.id, o.title, o.description, o.price_gross, o.stock,
         c.name, c.slug, market.brand_label(o.fulfillment_provider),
         o.image_url, market.atrybuty_publiczne(o.attributes), o.created_at
  from market.offers o
  join market.categories c on c.id = o.category_id
  where o.status = 'active'
    and o.is_test = false
    and coalesce(o.fulfillment_provider, '') <> 'teemdrop'
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5000), 10000));
$function$;
