-- Wybór regionu w nagłówku ścinał katalog z 700 ofert do 92 (zgłoszenie właściciela
-- 2026-09-25, przegląd „niepotrzebnych pól"). Powód: 605 z 700 aktywnych ofert to towar
-- wysyłkowy, który nie deklaruje ani `location`, ani promienia dojazdu — a `offer_serves`
-- wymagało jednego albo drugiego. Klient z Warszawy nie widział 605 rzeczy, które kurier
-- przywiezie mu pod drzwi, i nie dostawał żadnego wyjaśnienia.
--
-- Oferta bez zadeklarowanego miejsca nie jest „gdzie indziej" — jest wszędzie.
-- Rezerwacje i wynajem zostają poza tym wyjątkiem: nocleg albo auto bez podanego miasta
-- nie może wyskakiwać w każdym województwie.
create or replace function market.oferta_bez_miejsca(p_attrs jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select nullif(p_attrs->>'location','') is null
     and nullif(p_attrs->>'service_radius_km','') is null
     and coalesce(nullif(p_attrs->>'purchase_mode',''),'purchase') = 'purchase';
$function$;

revoke all on function market.oferta_bez_miejsca(jsonb) from public;
grant execute on function market.oferta_bez_miejsca(jsonb) to anon, authenticated;

-- Dokładamy jeden warunek do istniejącej definicji zamiast przepisywać 4,5 kB funkcji
-- z pamięci — przepisanie z ręki jest tu wyraźnie bardziej ryzykowne niż podmiana w miejscu.
-- Gdyby klauzula lokalizacji wyglądała inaczej, niż zakładamy, migracja wywali się głośno
-- zamiast po cichu podmienić coś innego.
--
-- `offer_serves` zostaje nietknięte, bo korzystają z niego także strony miast (`city_offers`,
-- SEO): tam mają być wyłącznie oferty naprawdę związane z miastem, a nie cały katalog
-- powielony na 78 podstronach.
do $patch$
declare
  src text;
  stara constant text := 'and (not (p_filters ? ''location'') or market.offer_serves(o.attributes, p_filters->>''location''))';
  nowa  constant text := 'and (not (p_filters ? ''location'') or market.offer_serves(o.attributes, p_filters->>''location'') or market.oferta_bez_miejsca(o.attributes))';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'market' and p.proname = 'search_offers_v2';
  if src is null then raise exception 'Brak market.search_offers_v2'; end if;
  if (length(src) - length(replace(src, stara, ''))) / length(stara) <> 1 then
    raise exception 'Oczekiwałem dokładnie jednego wystąpienia klauzuli lokalizacji w search_offers_v2';
  end if;
  execute replace(src, stara, nowa);
end
$patch$;
