-- Sunrise Social: produkty z Marketu na stronie firmy (2026-11-18).
--
-- Strona firmy w Sunrise Social (projekt MySunrise) pokazuje oferty sprzedawcy z Marketu.
-- Zakup zawsze idzie przez Market: koszyk, portfel/karta, cashback 3%, Ochrona Kupujących
-- i prowizje zostają bez zmian. Social niczego nie sprzedaje — tylko pokazuje i linkuje.
--
-- 1) social_seller_for_email — wywołuje WYŁĄCZNIE funkcja brzegowa MySunrise, z tokenem
--    serwis-serwis (ten sam co sunrise_pay_service_token). Na podstawie e-maila konta,
--    które MySunrise zweryfikowało z JWT, zwraca public_id aktywnego sprzedawcy.
--    Bez poprawnego tokenu zwraca null — nie da się nią sprawdzać cudzych adresów.
-- 2) social_seller_offers — publiczny odczyt aktywnych, nietestowych ofert aktywnego
--    sprzedawcy po public_id. Te same dane, które i tak widać w wyszukiwarce Marketu.

create or replace function market.social_seller_for_email(p_token text, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'market', 'public'
as $$
declare
  v_secret text;
  v_s record;
begin
  select value into v_secret from market.internal_secrets where key = 'sunrise_pay_service_token';
  if v_secret is null or p_token is null or p_token <> v_secret then
    return null;
  end if;
  select s.public_id, coalesce(nullif(s.legal_name, ''), 'Sprzedawca Sunrise Market') as nazwa, s.seller_type
    into v_s
    from market.sellers s
   where lower(s.email) = lower(trim(p_email))
     and s.status = 'active'
   order by s.created_at
   limit 1;
  if v_s.public_id is null then
    return jsonb_build_object('ok', false, 'error', 'brak_sprzedawcy');
  end if;
  return jsonb_build_object('ok', true, 'public_id', v_s.public_id, 'nazwa', v_s.nazwa, 'typ', v_s.seller_type);
end;
$$;

revoke all on function market.social_seller_for_email(text, text) from public;
grant execute on function market.social_seller_for_email(text, text) to anon, authenticated;

create or replace function market.social_seller_offers(p_public_id text, p_limit int default 24, p_offset int default 0)
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
      from market.offers o join s on s.id = o.seller_id
     where o.status = 'active' and coalesce(o.is_test, false) = false
  )
  select case when not exists (select 1 from s) then jsonb_build_object('ok', false, 'error', 'brak_sprzedawcy')
  else jsonb_build_object(
    'ok', true,
    'seller_id', (select id from s),
    'nazwa', (select nazwa from s),
    'liczba', (select count(*) from o),
    'oferty', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'tytul', x.title, 'cena', x.price_gross, 'waluta', x.currency,
        'zdjecie', x.image_url, 'cpp', x.cpp) order by x.created_at desc)
      from (select * from o order by created_at desc
            limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)) x
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function market.social_seller_offers(text, int, int) from public;
grant execute on function market.social_seller_offers(text, int, int) to anon, authenticated;
