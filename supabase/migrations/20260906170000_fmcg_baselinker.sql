-- Automatyczne hurtownie FMCG przez BaseLinker.
-- Produkty Sunrise z fulfillment_provider='baselinker' maja tylko cashback, bez sieci 40%.

create or replace function market.brand_label(p_provider text)
returns text language sql immutable set search_path to 'market','public' as $$
  select case coalesce(p_provider,'seller')
    when 'mysunrise' then 'Sunrise'
    when 'teemdrop' then 'Sunrise Market'
    when 'baselinker' then 'Sunrise Market'
    when 'cj' then 'Sunrise Market'
    when 'eprolo' then 'Sunrise Market'
    else 'Sprzedawca'
  end;
$$;

create or replace function market.cart_lanes(p_ids uuid[])
returns table(offer_id uuid, lane text, provider text, eta text)
language sql stable security definer set search_path to 'public','market' as $$
  select o.id as offer_id,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'shipping' then 'private_shipping' when 'pickup' then 'private_pickup' else 'private_both' end
      when coalesce(o.fulfillment_provider,'seller') in ('teemdrop','baselinker') then 'dropship'
      when coalesce(o.fulfillment_provider,'seller') = 'mysunrise' then 'ours'
      when s.pickup_enabled then 'seller_pickup'
      else 'seller'
    end as lane,
    case when coalesce((o.attributes->>'private_listing')::boolean,false) then 'private_partner' else coalesce(o.fulfillment_provider,'seller') end as provider,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'pickup' then 'Do ustalenia ze sprzedajacym' when 'shipping' then 'Wysylka od sprzedajacego' else 'Wysylka lub odbior osobisty' end
      when o.fulfillment_provider='teemdrop' then '15-25 dni roboczych'
      when o.fulfillment_provider='baselinker' then '1-3 dni robocze'
      when o.fulfillment_provider='mysunrise' then '3-7 dni (wysylka/montaz Sunrise)'
      when s.pickup_enabled then '1-3 dni robocze lub odbior w punkcie sprzedawcy'
      else '1-3 dni robocze'
    end as eta
  from market.offers o
  left join market.sellers s on s.id = o.seller_id
  where o.id = any(p_ids);
$$;

create or replace function market.create_fulfillment_tasks(p_order uuid) returns void
language plpgsql security definer set search_path to 'market','public' as $$
declare v_codes text[];
begin
  select coalesce(shipping_codes,'{}') into v_codes from market.orders where id = p_order;
  insert into market.fulfillment_tasks(
    order_id, order_item_id, offer_id, seller_id, lane, provider, sku, title, qty, unit_price_gross,
    ship_name, ship_phone, ship_street, ship_city, ship_postal, ship_country, delivery)
  select
    o.id, oi.id, oi.offer_id, oi.seller_id,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then 'dropship'
      when 'baselinker' then 'dropship'
      when 'mysunrise' then 'mysunrise'
      else 'seller' end,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then 'teemdrop'
      when 'baselinker' then coalesce(of2.attributes->>'supplier_code','baselinker')
      when 'mysunrise' then 'mysunrise'
      else s.legal_name end,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then of2.attributes->>'teemdrop_spu'
      when 'baselinker' then coalesce(of2.attributes->>'supplier_sku', of2.attributes->>'bl_product_id')
      when 'mysunrise' then of2.attributes->>'mysunrise_sku'
      else null end,
    of2.title, oi.qty, oi.unit_price_gross,
    o.ship_name, o.ship_phone, o.ship_street, o.ship_city, o.ship_postal, o.ship_country,
    case
      when coalesce((of2.attributes->>'private_listing')::boolean,false)
           and (coalesce(of2.attributes->>'delivery','both') = 'pickup' or 'private_pickup' = any(v_codes)) then 'pickup'
      when coalesce(of2.fulfillment_provider,'seller') = 'mysunrise' and 'pickup' = any(v_codes) then 'pickup'
      when coalesce(of2.fulfillment_provider,'seller') not in ('teemdrop','baselinker','mysunrise')
           and not coalesce((of2.attributes->>'private_listing')::boolean,false) and 'seller_pickup' = any(v_codes) then 'pickup'
      else 'shipping'
    end
  from market.orders o
  join market.order_items oi on oi.order_id=o.id
  join market.offers of2 on of2.id=oi.offer_id
  join market.sellers s on s.id=oi.seller_id
  where o.id=p_order
  on conflict (order_item_id) where order_item_id is not null do nothing;
end; $$;

-- Bezpiecznik ekonomiki: zewnetrzny FMCG nigdy nie moze wejsc do pelnej koperty MLM.
create or replace function market.enforce_fmcg_cashback_only()
returns trigger language plpgsql set search_path to 'market' as $$
begin
  if new.fulfillment_provider = 'baselinker' then
    new.commission_model := 'cashback_only';
    new.attributes := coalesce(new.attributes,'{}'::jsonb) || jsonb_build_object('cashback_only', true);
  end if;
  return new;
end; $$;

drop trigger if exists trg_enforce_fmcg_cashback_only on market.offers;
create trigger trg_enforce_fmcg_cashback_only
before insert or update of fulfillment_provider,commission_model,attributes on market.offers
for each row execute function market.enforce_fmcg_cashback_only();
