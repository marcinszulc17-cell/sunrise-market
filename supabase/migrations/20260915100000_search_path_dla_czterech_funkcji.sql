-- Cztery funkcje nie mialy ustalonego search_path. Przy SECURITY DEFINER to droga
-- do podstawienia wlasnej tabeli w sciezce wyszukiwania; tutaj sa INVOKER/trigger,
-- wiec ryzyko jest mniejsze, ale linter Supabase slusznie to zglasza i nic nas
-- nie kosztuje domkniecie tego na stale.
-- Cialo kazdej funkcji zostaje bez zmian — dokladamy wylacznie SET search_path.
-- Kwalifikujemy nazwy schematem, bo pusty search_path nie widzi juz market.*.

create or replace function market.t(p_i18n jsonb, p_locale text, p_field text, p_fallback text)
returns text
language sql immutable
set search_path to ''
as $function$
  select coalesce(nullif(p_i18n -> lower(coalesce(p_locale,'pl')) ->> p_field, ''), p_fallback);
$function$;

create or replace function market.km_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql immutable
set search_path to ''
as $function$
  select 2*6371*asin(sqrt(sin(radians(lat2-lat1)/2)^2 + cos(radians(lat1))*cos(radians(lat2))*sin(radians(lon2-lon1)/2)^2));
$function$;

create or replace function market.offer_serves(p_attrs jsonb, p_loc text)
returns boolean
language sql stable
set search_path to ''
as $function$
  select coalesce(p_attrs->>'location','') ilike '%'||p_loc||'%'
      or (
        (p_attrs->>'service_radius_km') is not null and exists (
          select 1 from market.service_cities c
          where (c.name ilike '%'||p_loc||'%' or c.region ilike '%'||p_loc||'%')
            and market.km_between((p_attrs->>'service_lat')::float8,(p_attrs->>'service_lon')::float8,c.lat,c.lon) <= (p_attrs->>'service_radius_km')::float8
        )
      );
$function$;

create or replace function market.keep_enriched_description()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(old.attributes->>'enriched','false') = 'true'
     and new.description is distinct from old.description
     and coalesce(current_setting('app.enriching', true), '') <> 'on'
  then
    new.description := old.description;
  end if;
  return new;
end $function$;
