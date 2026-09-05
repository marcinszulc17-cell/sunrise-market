-- my_offers zwraca też aktywną promocję (attributes->'promo'), żeby panel ofert pokazał plakietkę i starą cenę.
-- Zastosowane na produkcji 2026-09-05.
drop function if exists market.my_offers();
create function market.my_offers()
returns table(offer_id uuid, title text, price_gross numeric, stock integer, status text, category text, created_at timestamptz, promo jsonb)
language sql stable security definer set search_path to ''
as $$
  select o.id, o.title, o.price_gross, o.stock, o.status, c.name, o.created_at, o.attributes->'promo'
  from market.offers o
  join market.categories c on c.id = o.category_id
  where (o.seller_id = market.current_seller_id() or market.is_operator())
  order by o.created_at desc;
$$;
grant execute on function market.my_offers() to authenticated;
