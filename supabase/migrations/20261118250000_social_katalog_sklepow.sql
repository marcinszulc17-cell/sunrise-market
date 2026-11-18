-- Sunrise Social: katalog wszystkich sklepów Marketu (2026-11-18).
-- Zakładka „Sklepy" w /social/market pokazuje każdego aktywnego sprzedawcę z jego ofertami.
-- Publiczny odczyt tego samego, co widać na profilu sprzedawcy (/sprzedawcy/:id); zakup tylko w Markecie.
create or replace function market.social_sellers(p_query text default null, p_limit int default 24, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path to 'market', 'public'
as $$
  with s as (
    select s.id, s.public_id, s.seller_type, s.created_at,
           coalesce(nullif(s.legal_name, ''), 'Sprzedawca Sunrise Market') as nazwa,
           (select count(*) from market.offers o where o.seller_id = s.id and o.status = 'active' and coalesce(o.is_test, false) = false) as liczba
      from market.sellers s
     where s.status = 'active'
       and (p_query is null or trim(p_query) = '' or s.legal_name ilike '%' || trim(p_query) || '%')
  ),
  w as (
    select * from s where liczba > 0
     order by liczba desc, created_at
     limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'ok', true,
    'razem', (select count(*) from s where liczba > 0),
    'sklepy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id', w.id, 'public_id', w.public_id, 'nazwa', w.nazwa, 'typ', w.seller_type, 'liczba', w.liczba,
        'ocena', coalesce(r.srednia_ocen, 0), 'opinie', coalesce(r.liczba_opinii, 0), 'odznaka', r.badge,
        'zdjecia', coalesce((select jsonb_agg(z.image_url) from (
            select o.image_url from market.offers o
             where o.seller_id = w.id and o.status = 'active' and coalesce(o.is_test, false) = false and o.image_url is not null
             order by o.created_at desc limit 4) z), '[]'::jsonb)
      ) order by w.liczba desc, w.created_at)
      from w left join market.seller_reputation r on r.seller_id = w.id
    ), '[]'::jsonb)
  );
$$;
revoke all on function market.social_sellers(text, int, int) from public;
grant execute on function market.social_sellers(text, int, int) to anon, authenticated;
