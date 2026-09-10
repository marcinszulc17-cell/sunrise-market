-- Sprzedawca prywatny może już sprzedawać (decyzja właściciela 2026-09-10).
-- Regulamin od tej zmiany obiecuje Kupującemu, że status sprzedawcy (firma / osoba prywatna)
-- widać PRZY OFERCIE, zanim złoży zamówienie — bo od tego zależy prawo do zwrotu w 14 dni.
-- Nie ruszamy get_offer (drop/create przerwałby działanie karty produktu); dokładamy
-- osobne, lekkie zapytanie o sam status.
create or replace function market.offer_seller_badge(p_id uuid)
returns table (
  seller_id uuid,
  seller_type text,
  is_private boolean,
  consumer_rights boolean,
  since date
)
language sql
stable
security definer
set search_path to ''
as $function$
  select s.id,
         s.seller_type,
         s.seller_type = 'private_partner',
         s.seller_type <> 'private_partner',   -- 14 dni na odstąpienie ma tylko zakup od firmy
         s.created_at::date
  from market.offers o
  join market.sellers s on s.id = o.seller_id
  where o.id = p_id and o.status = 'active';
$function$;

grant execute on function market.offer_seller_badge(uuid) to anon, authenticated;
