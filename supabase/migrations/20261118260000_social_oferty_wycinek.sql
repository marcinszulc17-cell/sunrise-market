-- Sunrise Social: sklep strony marki = wycinek katalogu sprzedawcy (prefiksy slugów kategorii).
-- Marki Sunrise (Sunrise Energy, Thermo, Rent…) sprzedają z jednego konta Green Eco World (sunrise-1p);
-- bez wycinka strona Sunrise Thermo pokazywałaby też karmę dla psa. p_kategorie = null → cały sklep.
create or replace function market.social_seller_offers_v2(p_public_id text, p_kategorie text[] default null, p_limit int default 24, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path to 'market', 'public'
as $$
  with s as (
    select id, public_id, coalesce(nullif(legal_name, ''), 'Sprzedawca Sunrise Market') as nazwa
      from market.sellers
     where public_id = p_public_id and status = 'active'
  ),
  o as (
    select o.id, o.title, o.price_gross, o.currency, o.image_url, o.created_at,
           coalesce((o.attributes->'cpp'->>'eligible')::boolean, false) as cpp
      from market.offers o
      join s on s.id = o.seller_id
      left join market.categories c on c.id = o.category_id
     where o.status = 'active' and coalesce(o.is_test, false) = false
       and (p_kategorie is null or cardinality(p_kategorie) = 0
            or c.slug like any (select k || '%' from unnest(p_kategorie) k))
  )
  select case when not exists (select 1 from s) then jsonb_build_object('ok', false, 'error', 'brak_sprzedawcy')
  else jsonb_build_object(
    'ok', true, 'seller_id', (select id from s), 'nazwa', (select nazwa from s),
    'liczba', (select count(*) from o),
    'oferty', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'tytul', x.title, 'cena', x.price_gross, 'waluta', x.currency,
        'zdjecie', x.image_url, 'cpp', x.cpp) order by x.created_at desc)
      from (select * from o order by created_at desc
            limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)) x
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function market.social_seller_offers_v2(text, text[], int, int) from public;
grant execute on function market.social_seller_offers_v2(text, text[], int, int) to anon, authenticated;
