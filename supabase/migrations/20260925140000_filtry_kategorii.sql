-- Panel filtrów obiecywał opcje, których w danej gałęzi nie ma (zgłoszenie właściciela
-- 2026-09-25, na przykładzie Fotowoltaiki — 36 ofert, wszystkie na sprzedaż, wszystkie
-- powyżej 6 990 zł):
--   • „Usługi", „Wynajem", „Do rezerwacji" — trzy przyciski do pustej listy,
--   • „Do 500 zł", „500 – 1 500 zł", „1 500 – 3 000 zł" — trzy widełki do pustej listy,
--   • „Szczegóły" ze słownika: „Moc (kW)" przy Magazynach energii i „Pojemność magazynu
--     (kWh)" przy Ogrzewaniu, Pompach ciepła i Klimatyzacji — pola, których żadna oferta
--     w tej gałęzi nie wypełnia.
-- To ta sama rodzina błędu, co licznik „1 oferta" przy pustych Noclegach: filtr mówi,
-- że coś jest, a po kliknięciu tego nie ma.
--
-- Jedno zapytanie oddaje wszystko, czego panel potrzebuje, i liczy DOKŁADNIE tak, jak liczy
-- search_offers_v2 (ten sam status, te same złączenia) — inaczej liczba przy przycisku
-- rozjechałaby się z długością listy po kliknięciu.
--
-- UWAGA: to dotyczy WYŁĄCZNIE filtrowania. Kreatory ofert czytają `category_attributes`
-- osobno i muszą pokazywać komplet pól — tam sprzedawca dopiero te dane tworzy.
create or replace function market.filtry_kategorii(p_category_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'market', 'public'
as $function$
  with recursive sel as (
    select id from market.categories where p_category_slug is not null and slug = p_category_slug
    union all
    select c.id from market.categories c join sel on c.parent_id = sel.id
  ),
  widoczne as (
    select coalesce(nullif(o.attributes->>'purchase_mode',''),'purchase') as tryb,
           o.price_gross, o.attributes
    from market.offers o
    join market.categories c on c.id = o.category_id
    join market.sellers s on s.id = o.seller_id
    where o.status = 'active'
      and (p_category_slug is null or o.category_id in (select id from sel))
  ),
  slownik as (
    select a.key
    from market.category_attributes a
    join market.categories c on c.id = a.category_id
    where c.slug = p_category_slug
  )
  select jsonb_build_object(
    'tryby', coalesce((select jsonb_object_agg(tryb, n) from (select tryb, count(*) n from widoczne group by tryb) t), '{}'::jsonb),
    'cena_min', (select min(price_gross) from widoczne where price_gross > 0),
    'cena_max', (select max(price_gross) from widoczne),
    -- Ile ofert w gałęzi faktycznie wypełnia każde pole ze słownika tej kategorii.
    'pola', coalesce((
      select jsonb_object_agg(s.key, (select count(*) from widoczne w where nullif(w.attributes->>s.key,'') is not null))
      from slownik s), '{}'::jsonb)
  );
$function$;

revoke all on function market.filtry_kategorii(text) from public;
grant execute on function market.filtry_kategorii(text) to anon, authenticated;

-- Poprzednie podejście (tylko tryby, bez widełek i pól) żyło kilka minut i nic go nie używa.
drop function if exists market.tryby_ofert(text);
