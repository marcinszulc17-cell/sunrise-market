-- Moje opinie (kupujący): do oceniania zakupów bezpośrednio w Zamówieniach (2026-09-05).
create or replace function market.my_reviews()
returns jsonb language sql stable security definer set search_path to 'market' as $$
  select coalesce(jsonb_agg(jsonb_build_object('offer_id', r.offer_id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at, 'seller_reply', r.seller_reply) order by r.created_at desc), '[]'::jsonb)
  from market.reviews r where r.buyer_id = auth.uid();
$$;
grant execute on function market.my_reviews() to authenticated;
