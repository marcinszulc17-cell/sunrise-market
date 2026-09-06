-- 2026-09-06: Sunny pokazywał losowe oferty na „szukam auta” — suri_recommend ignorował p_category_slug i dopasowywał tylko tytuł.
-- Teraz: filtr kategorii (z podkategoriami), tryb (purchase|appointment|daily), dopasowanie po tytule, kategorii i opisie;
-- gdy jest kategoria/tryb, a fraza nic nie trafia — zwracamy oferty z tej kategorii (nie z całej bazy).
drop function if exists market.suri_recommend(text, numeric, text, integer);
create or replace function market.suri_recommend(p_query text, p_budget numeric default null, p_category_slug text default null, p_limit integer default 3, p_mode text default null)
returns table(offer_id uuid, title text, price numeric, seller text, rating numeric, cashback numeric, vs_median text, reason text)
language sql stable security definer set search_path to 'market','public','extensions' as $$
  with cat as (
    select c.id from market.categories c where p_category_slug is not null and c.slug = p_category_slug
    union select k.id from market.categories k join market.categories c on k.parent_id = c.id where p_category_slug is not null and c.slug = p_category_slug
    union select g.id from market.categories g join market.categories k on g.parent_id = k.id join market.categories c on k.parent_id = c.id where p_category_slug is not null and c.slug = p_category_slug
  ),
  toks as (select tok from regexp_split_to_table(lower(coalesce(p_query,'')), '\s+') tok where length(tok) >= 3),
  cand as (
    select o.id, o.title, o.price_gross, market.brand_label(o.fulfillment_provider) as seller, o.category_id,
           coalesce(rep.srednia_ocen,0) as rating, rep.badge, round(o.price_gross*0.03,2) as cb,
           greatest(word_similarity(coalesce(p_query,''), o.title), 0)
             + (select coalesce(sum(case when o.title ilike '%'||t.tok||'%' then 0.5 when k.name ilike '%'||t.tok||'%' then 0.3 when word_similarity(t.tok, o.title) > 0.45 then 0.2 else 0 end),0) from toks t) as sim
    from market.offers o
    join market.sellers s on s.id = o.seller_id
    left join market.categories k on k.id = o.category_id
    left join market.seller_reputation rep on rep.seller_id = s.id
    where o.status = 'active'
      and (p_budget is null or o.price_gross <= p_budget)
      and (p_category_slug is null or o.category_id in (select id from cat))
      and (p_mode is null or coalesce(o.attributes->>'purchase_mode','purchase') = p_mode)
  ),
  scored as (
    select * from cand
    where (p_category_slug is not null or p_mode is not null)          -- kategoria/tryb zawęża — fraza tylko sortuje
       or sim >= 0.3
  ),
  med as (select category_id, percentile_cont(0.5) within group (order by price_gross) as m from market.offers where status = 'active' group by category_id)
  select c.id, c.title, c.price_gross, c.seller, c.rating, c.cb,
    case when m.m is null then 'brak danych' when c.price_gross < m.m*0.95 then 'ponizej sredniej' when c.price_gross > m.m*1.05 then 'powyzej sredniej' else 'w srednich cenach' end,
    case when c.price_gross < coalesce(m.m,1e9)*0.95 then 'okazja cenowa + cashback '||c.cb||' zl'
         when c.badge = 'Super Sprzedawca' then 'sprawdzony sprzedawca, cashback '||c.cb||' zl'
         else 'opcja w budzecie, cashback '||c.cb||' zl' end
  from scored c left join med m on m.category_id = c.category_id
  order by c.sim desc, (c.rating*20 - c.price_gross/100) desc
  limit greatest(1, least(10, coalesce(p_limit,3)));
$$;
revoke all on function market.suri_recommend(text,numeric,text,integer,text) from public;
grant execute on function market.suri_recommend(text,numeric,text,integer,text) to anon, authenticated, service_role;
