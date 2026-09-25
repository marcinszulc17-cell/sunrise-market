-- Pasek „Jak chcesz skorzystać?" pokazywał wszystkie tryby w każdej kategorii, także tam,
-- gdzie żadna oferta ich nie ma. W Fotowoltaice (36 ofert, wszystkie na sprzedaż) „Usługi",
-- „Wynajem" i „Do rezerwacji" były trzema przyciskami prowadzącymi do pustej listy
-- (pytanie właściciela 2026-09-25) — ta sama rodzina błędu, co licznik „1 oferta" przy
-- pustych Noclegach.
--
-- Liczymy DOKŁADNIE tak, jak liczy search_offers_v2 (ten sam status, te same złączenia),
-- żeby filtr nigdy nie obiecał trybu, którego lista potem nie pokaże.
create or replace function market.tryby_ofert(p_category_slug text default null)
returns table(tryb text, ofert bigint)
language sql
stable
security definer
set search_path to 'market', 'public'
as $function$
  with recursive sel as (
    select id from market.categories where p_category_slug is not null and slug = p_category_slug
    union all
    select c.id from market.categories c join sel on c.parent_id = sel.id
  )
  select coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase') as tryb, count(*)::bigint
  from market.offers o
  join market.categories c on c.id = o.category_id
  join market.sellers s on s.id = o.seller_id
  where o.status = 'active'
    and (p_category_slug is null or o.category_id in (select id from sel))
  group by 1;
$function$;

revoke all on function market.tryby_ofert(text) from public;
grant execute on function market.tryby_ofert(text) to anon, authenticated;
