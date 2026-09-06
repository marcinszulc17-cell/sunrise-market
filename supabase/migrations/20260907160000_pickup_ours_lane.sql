-- 2026-09-06 (decyzja właściciela: „odbiór osobisty zrób również”): odbiór osobisty także dla produktów Sunrise (magazyn własny).
--  • Punkt odbioru Sunrise: Kolejowa 20, 64-300 Nowy Tomyśl (sellers.pickup_* dla sprzedawcy 'sunrise').
--  • Dropship (teemdrop) dostaje własny tor 'dropship' — tam odbioru osobistego NIE ma (towar idzie od dostawcy prosto do klienta).
--  • Metoda 'pickup' (0 zł) obsługuje tor 'ours' (magazyn Sunrise); nazwa z polskimi znakami.
update market.shipping_methods set name = 'Odbiór osobisty (Nowy Tomyśl)', lanes = array['ours'] where code = 'pickup';
update market.shipping_methods set lanes = array_remove(lanes, 'ours') || array['dropship'] where code in ('dpd','inpost_courier') and 'ours' = any(lanes);
update market.shipping_methods set lanes = lanes || array['dropship'] where code = 'inpost_locker' and not ('dropship' = any(lanes));
-- kurierzy nadal obsługują tor 'ours' (wysyłka z magazynu Sunrise)
update market.shipping_methods set lanes = lanes || array['ours'] where code in ('dpd','inpost_courier','inpost_locker') and not ('ours' = any(lanes));

create or replace function market.cart_lanes(p_ids uuid[])
returns table(offer_id uuid, lane text, provider text, eta text)
language sql stable security definer set search_path to 'public','market' as $$
  select o.id as offer_id,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'shipping' then 'private_shipping' when 'pickup' then 'private_pickup' else 'private_both' end
      when coalesce(o.fulfillment_provider,'seller') = 'teemdrop' then 'dropship'
      when coalesce(o.fulfillment_provider,'seller') = 'mysunrise' then 'ours'
      when s.pickup_enabled then 'seller_pickup'
      else 'seller'
    end as lane,
    case when coalesce((o.attributes->>'private_listing')::boolean,false) then 'private_partner' else coalesce(o.fulfillment_provider,'seller') end as provider,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'pickup' then 'Do ustalenia ze sprzedającym' when 'shipping' then 'Wysyłka od sprzedającego' else 'Wysyłka lub odbiór osobisty' end
      when o.fulfillment_provider='teemdrop' then '15–25 dni roboczych'
      when o.fulfillment_provider='mysunrise' then '3–7 dni (wysyłka/montaż Sunrise) lub odbiór osobisty w Nowym Tomyślu'
      when s.pickup_enabled then '1–3 dni robocze lub odbiór w punkcie sprzedawcy'
      else '1–3 dni robocze'
    end as eta
  from market.offers o
  left join market.sellers s on s.id = o.seller_id
  where o.id = any(p_ids);
$$;
