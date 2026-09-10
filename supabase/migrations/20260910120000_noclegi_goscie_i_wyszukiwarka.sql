-- Noclegi „jak na Booking” (decyzja właściciela 2026-09-10).
-- Silnik rezerwacji dobowych już istnieje (booking_offers.booking_type='daily', cenniki sezonowe,
-- rabaty za długość, blokady, zasoby, kaucje, protokoły). Brakowało warstwy noclegowej:
-- liczby gości, doby hotelowej i wyszukiwarki po dostępności w zadanym terminie.

-- 1. Pojemność i doba hotelowa na ofercie rezerwacyjnej.
alter table market.booking_offers
  add column if not exists max_guests integer,
  add column if not exists checkin_from time,
  add column if not exists checkout_until time;

comment on column market.booking_offers.max_guests is 'Maksymalna liczba gości (noclegi). NULL = nie dotyczy, np. wynajem auta.';
comment on column market.booking_offers.checkin_from is 'Doba hotelowa od (czas lokalny obiektu).';
comment on column market.booking_offers.checkout_until is 'Doba hotelowa do (czas lokalny obiektu).';

-- Udogodnienia trzymamy w offers.attributes.amenities jako tablicę slugów, np.
-- ["wifi","parking","sniadanie","basen","zwierzeta","klimatyzacja","kuchnia","pralka"].
-- Bez osobnej tabeli — filtrujemy operatorem @> po jsonb, indeks poniżej.
create index if not exists offers_amenities_gin
  on market.offers using gin ((attributes -> 'amenities'));

-- 2. Wyszukiwarka noclegów: dokąd / termin / liczba osób.
-- Zwraca tylko oferty WOLNE w całym zakresie i mieszczące podaną liczbę gości,
-- z ceną za dobę i kwotą za cały pobyt (cennik sezonowy + opłata za sprzątanie).
create or replace function market.search_stays(
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_guests integer default null,
  p_amenities text[] default null,
  p_category_slug text default null,
  p_max_nightly numeric default null,
  p_limit integer default 24,
  p_offset integer default 0
) returns table (
  offer_id uuid,
  title text,
  image_url text,
  category text,
  category_slug text,
  location text,
  seller text,
  rating numeric,
  reviews integer,
  max_guests integer,
  amenities jsonb,
  nightly_from numeric,
  nights integer,
  total_gross numeric,
  cleaning_fee_gross numeric,
  deposit_gross numeric,
  instant_booking boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_nights integer;
begin
  if p_from is not null and p_to is not null then
    if p_to <= p_from then raise exception 'Data wyjazdu musi być późniejsza niż przyjazdu'; end if;
    if p_to - p_from > 370 then raise exception 'Zakres dat jest zbyt duży'; end if;
    v_nights := p_to - p_from;
  end if;

  return query
  with baza as (
    select o.id, o.title, o.image_url, o.attributes, c.name as cat_name, c.slug as cat_slug,
           b.max_guests as cap, b.cleaning_fee_gross, b.deposit_gross, b.instant_booking,
           b.min_units, b.max_units,
           s.legal_name as seller_name
    from market.offers o
    join market.categories c on c.id = o.category_id
    join market.booking_offers b on b.offer_id = o.id and b.active and b.booking_type = 'daily'
    join market.sellers s on s.id = o.seller_id and s.status = 'active'
    where o.status = 'active'
      and c.slug like 'noclegi%'
      and (p_category_slug is null or c.slug = p_category_slug)
      and (p_guests is null or b.max_guests is null or b.max_guests >= p_guests)
      and (p_amenities is null or array_length(p_amenities, 1) is null
           or (o.attributes -> 'amenities') @> to_jsonb(p_amenities))
      and (p_query is null or p_query = ''
           or o.title ilike '%' || p_query || '%'
           or coalesce(o.attributes ->> 'location', '') ilike '%' || p_query || '%')
  ), wycena as (
    select baza.*,
      case when v_nights is null then market.booking_price_for_day(baza.id, current_date)
           else (select min(market.booking_price_for_day(baza.id, d::date))
                 from generate_series(p_from, p_to - 1, interval '1 day') d) end as noc_od,
      case when v_nights is null then null
           else (select sum(market.booking_price_for_day(baza.id, d::date))
                 from generate_series(p_from, p_to - 1, interval '1 day') d) end as suma_noclegow
    from baza
  )
  select w.id, w.title, w.image_url, w.cat_name, w.cat_slug,
         nullif(w.attributes ->> 'location', ''), w.seller_name,
         (select round(avg(r.rating)::numeric, 1) from market.reviews r where r.offer_id = w.id),
         (select count(*)::integer from market.reviews r where r.offer_id = w.id),
         w.cap,
         coalesce(w.attributes -> 'amenities', '[]'::jsonb),
         w.noc_od,
         v_nights,
         case when w.suma_noclegow is null then null
              else w.suma_noclegow + coalesce(w.cleaning_fee_gross, 0) end,
         w.cleaning_fee_gross, w.deposit_gross, coalesce(w.instant_booking, false)
  from wycena w
  where (p_max_nightly is null or w.noc_od <= p_max_nightly)
    -- Termin podany: oferta musi być wolna w KAŻDĄ dobę pobytu i mieścić się w limitach długości.
    and (v_nights is null or (
          (w.min_units is null or v_nights >= w.min_units)
      and (w.max_units is null or v_nights <= w.max_units)
      and not exists (
            select 1 from market.booking_unavailable_days_v2(w.id, p_from, p_to - 1) u
            where u.day is not null)
    ))
  order by w.noc_od nulls last, w.title
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

grant execute on function market.search_stays(text, date, date, integer, text[], text, numeric, integer, integer) to anon, authenticated;

-- 3. Zapis pojemności i doby hotelowej przez sprzedawcę (obok istniejącego seller_booking_save_extras).
create or replace function market.seller_booking_save_stay(
  p_offer uuid,
  p_max_guests integer,
  p_checkin_from time,
  p_checkout_until time
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update market.booking_offers b
     set max_guests = nullif(greatest(coalesce(p_max_guests, 0), 0), 0),
         checkin_from = p_checkin_from,
         checkout_until = p_checkout_until,
         updated_at = now()
   where b.offer_id = p_offer
     and b.seller_id = market.current_seller_id();
  if not found then raise exception 'Brak dostępu do tej oferty'; end if;
end;
$function$;

grant execute on function market.seller_booking_save_stay(uuid, integer, time, time) to authenticated;
