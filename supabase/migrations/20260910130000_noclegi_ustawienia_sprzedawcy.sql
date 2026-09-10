-- Odczyt i zapis ustawień noclegowych przez sprzedawcę (pojemność, doba hotelowa, udogodnienia).
-- Zastępuje 4-argumentowy wariant seller_booking_save_stay z migracji 20260910120000.
drop function if exists market.seller_booking_save_stay(uuid, integer, time, time);

create or replace function market.seller_stay_settings(p_offer uuid)
returns jsonb
language sql stable security definer set search_path to ''
as $function$
  select jsonb_build_object(
    'max_guests', b.max_guests,
    'checkin_from', b.checkin_from,
    'checkout_until', b.checkout_until,
    'amenities', coalesce(o.attributes -> 'amenities', '[]'::jsonb)
  )
  from market.booking_offers b
  join market.offers o on o.id = b.offer_id
  where b.offer_id = p_offer and b.seller_id = market.current_seller_id();
$function$;

create or replace function market.seller_booking_save_stay(
  p_offer uuid,
  p_max_guests integer,
  p_checkin_from time,
  p_checkout_until time,
  p_amenities text[] default null
) returns void
language plpgsql security definer set search_path to ''
as $function$
declare v_seller uuid := market.current_seller_id();
begin
  update market.booking_offers b
     set max_guests = nullif(greatest(coalesce(p_max_guests, 0), 0), 0),
         checkin_from = p_checkin_from,
         checkout_until = p_checkout_until,
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

grant execute on function market.seller_stay_settings(uuid) to authenticated;
grant execute on function market.seller_booking_save_stay(uuid, integer, time, time, text[]) to authenticated;
