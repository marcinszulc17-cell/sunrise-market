-- Pieć funkcji żyło tylko na produkcji — powstały doraźnie, bez migracji.
-- Odtworzenie bazy od zera gubiło je i psuło: wycenę dobową z liczbą osób,
-- kalendarz niedostępności zasobu, blokadę rezerwacji z liczbą osób,
-- listę metod wysyłki z lanes oraz zapis danych obiektu noclegowego.
-- Ten plik jest wiernym zrzutem stanu produkcyjnego z 2026-09-15 — nie zmienia
-- zachowania, tylko domyka lukę między bazą a repozytorium.

create or replace function market.list_shipping_v2()
returns table(code text, name text, carrier text, price_gross numeric, lanes text[])
language sql stable security definer set search_path to 'public', 'market'
as $function$
  select code, name, carrier, price_gross, lanes
  from market.shipping_methods where active order by price_gross;
$function$;

create or replace function market.booking_daily_quote_v3(p_offer uuid, p_from date, p_to date, p_guests integer default null)
returns table(days integer, base numeric, guests integer, price_mode text, per_person boolean)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_days integer; v_base numeric; v_mode text; v_max integer; v_guests integer;
begin
  select b.price_mode, b.max_guests into v_mode, v_max
  from market.booking_offers b where b.offer_id = p_offer and b.active and b.booking_type = 'daily';
  if v_mode is null then raise exception 'Rezerwacja dobowa tej oferty jest niedostępna'; end if;

  select q.days, q.base into v_days, v_base from market.booking_daily_quote_v2(p_offer, p_from, p_to) q;

  v_guests := greatest(1, coalesce(p_guests, 1));
  if v_max is not null and v_guests > v_max then
    raise exception 'Ten obiekt przyjmuje maksymalnie % osób', v_max;
  end if;

  if v_mode = 'per_person' then
    v_base := round(v_base * v_guests, 2);
  end if;

  return query select v_days, v_base, v_guests, v_mode, v_mode = 'per_person';
end;
$function$;

create or replace function market.booking_resource_unavailable_days_v2(p_offer uuid, p_resource uuid, p_from date, p_to date)
returns table(day date, reason text)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_timezone text;
  v_type text;
begin
  if p_offer is null or p_resource is null or p_from is null or p_to is null then
    raise exception 'Podaj ofertę, zasób i zakres dat';
  end if;
  if p_to < p_from then raise exception 'Nieprawidłowy zakres dat'; end if;
  if p_to - p_from > 370 then raise exception 'Zakres dat jest zbyt duży'; end if;

  select b.timezone,b.booking_type
    into v_timezone,v_type
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active;

  if v_timezone is null or v_type<>'daily' then return; end if;

  if not exists(
    select 1
    from market.booking_offer_resources bor
    join market.booking_resources r on r.id=bor.resource_id and r.active
    where bor.offer_id=p_offer and bor.resource_id=p_resource
  ) then
    raise exception 'Wybrany zasób jest niedostępny';
  end if;

  return query
  with days as (
    select gs::date as day,
           (gs::date::timestamp at time zone v_timezone) as starts_at,
           ((gs::date+1)::timestamp at time zone v_timezone) as ends_at
    from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') gs
  )
  select d.day,
         case
           when exists(
             select 1 from market.booking_blocks z
             where z.offer_id=p_offer
               and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
           ) then 'blocked'
           else 'booked'
         end
  from days d
  where exists(
    select 1 from market.booking_blocks z
    where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
  )
  or not market.booking_daily_resource_available(p_offer,p_resource,d.starts_at,d.ends_at)
  order by d.day;
end;
$function$;

create or replace function market.create_booking_hold_v3(p_offer uuid, p_starts_at timestamptz, p_ends_at timestamptz default null, p_service uuid default null, p_resource uuid default null, p_guests integer default null)
returns table(booking_id uuid, starts_at timestamptz, ends_at timestamptz, base_amount_gross numeric, fees_gross numeric, deposit_gross numeric, amount_gross numeric, hold_expires_at timestamptz)
language plpgsql security definer set search_path to 'market', 'public'
as $function$
declare v_mode text; v_max integer; v_guests integer; v_row record; v_extra numeric;
begin
  select b.price_mode, b.max_guests into v_mode, v_max
  from market.booking_offers b where b.offer_id = p_offer and b.active;

  v_guests := greatest(1, coalesce(p_guests, 1));
  if v_max is not null and v_guests > v_max then
    raise exception 'Ten obiekt przyjmuje maksymalnie % osób', v_max;
  end if;

  select * into v_row from market.create_booking_hold_v2(p_offer, p_starts_at, p_ends_at, p_service, p_resource) h;

  if coalesce(v_mode,'per_night') = 'per_person' and v_guests > 1 then
    v_extra := round(v_row.base_amount_gross * (v_guests - 1), 2);
    update market.bookings b
       set guests = v_guests,
           base_amount_gross = round(b.base_amount_gross * v_guests, 2),
           unit_price_gross = round(case when b.units > 0 then (b.base_amount_gross * v_guests) / b.units else b.base_amount_gross * v_guests end, 2),
           amount_gross = round(b.amount_gross + v_extra, 2),
           updated_at = now()
     where b.id = v_row.booking_id;
    return query
      select b.id, b.starts_at, b.ends_at, b.base_amount_gross, b.fees_gross, b.deposit_gross, b.amount_gross, b.hold_expires_at
      from market.bookings b where b.id = v_row.booking_id;
  else
    update market.bookings b set guests = v_guests, updated_at = now() where b.id = v_row.booking_id;
    return query select v_row.booking_id, v_row.starts_at, v_row.ends_at, v_row.base_amount_gross,
                        v_row.fees_gross, v_row.deposit_gross, v_row.amount_gross, v_row.hold_expires_at;
  end if;
end;
$function$;

create or replace function market.seller_booking_save_stay_v2(p_offer uuid, p_max_guests integer, p_checkin_from time, p_checkout_until time, p_amenities text[] default null, p_bedrooms integer default null, p_bathrooms integer default null, p_beds jsonb default null, p_area_m2 numeric default null, p_quiet_from time default null, p_quiet_to time default null, p_smoking boolean default null, p_parties boolean default null, p_children boolean default null, p_pets boolean default null, p_checkin_instructions text default null, p_house_rules text default null)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare v_seller uuid := market.current_seller_id();
begin
  update market.booking_offers b
     set max_guests = nullif(greatest(coalesce(p_max_guests, 0), 0), 0),
         checkin_from = p_checkin_from,
         checkout_until = p_checkout_until,
         bedrooms = nullif(greatest(coalesce(p_bedrooms, 0), 0), 0),
         bathrooms = nullif(greatest(coalesce(p_bathrooms, 0), 0), 0),
         beds = p_beds,
         area_m2 = nullif(greatest(coalesce(p_area_m2, 0), 0), 0),
         quiet_hours_from = p_quiet_from,
         quiet_hours_to = p_quiet_to,
         smoking_allowed = p_smoking,
         parties_allowed = p_parties,
         children_allowed = p_children,
         pets_allowed = p_pets,
         checkin_instructions = nullif(trim(coalesce(p_checkin_instructions, '')), ''),
         house_rules_extra = nullif(trim(coalesce(p_house_rules, '')), ''),
         updated_at = now()
   where b.offer_id = p_offer and b.seller_id = v_seller;
  if not found then raise exception 'Brak dostępu do tej oferty'; end if;

  update market.offers o
     set attributes = coalesce(o.attributes, '{}'::jsonb)
                      || jsonb_build_object('amenities', to_jsonb(coalesce(p_amenities, '{}'::text[]))),
         updated_at = now()
   where o.id = p_offer and o.seller_id = v_seller;
end;
$function$;
