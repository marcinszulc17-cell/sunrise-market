create or replace function market.seller_booking_save_extras(
  p_offer uuid,
  p_min_units integer,
  p_max_units integer,
  p_cleaning_fee numeric,
  p_deposit numeric,
  p_instant boolean
) returns void
language plpgsql
security definer
set search_path to 'market','public'
as $function$
declare
  v_seller uuid := market.current_seller_id();
  v_deposit_allowed boolean := false;
begin
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.offers where id=p_offer and seller_id=v_seller) then
    raise exception 'Brak dostępu do oferty';
  end if;

  select exists(
    select 1
    from market.offers o
    join market.categories c on c.id=o.category_id
    join market.booking_offers b on b.offer_id=o.id
    where o.id=p_offer
      and o.seller_id=v_seller
      and b.booking_type='daily'
      and (
        c.slug like 'motoryzacja-%'
        or lower(coalesce(o.attributes->>'rental_kind','')) in ('car','product','equipment')
        or lower(coalesce(o.attributes->>'offer_type','')) in ('car_rental','product_rental','equipment_rental')
        or exists(
          select 1
          from market.booking_offer_resources bor
          join market.booking_resources r on r.id=bor.resource_id and r.active
          where bor.offer_id=o.id and r.kind in ('vehicle','equipment')
        )
      )
  ) into v_deposit_allowed;

  update market.booking_offers
  set min_units=greatest(1,coalesce(p_min_units,1)),
      max_units=greatest(greatest(1,coalesce(p_min_units,1)),coalesce(p_max_units,30)),
      cleaning_fee_gross=greatest(0,coalesce(p_cleaning_fee,0)),
      deposit_gross=case when v_deposit_allowed then greatest(0,coalesce(p_deposit,0)) else 0 end,
      instant_booking=coalesce(p_instant,true),
      updated_at=now()
  where offer_id=p_offer and seller_id=v_seller;

  if not found then raise exception 'Najpierw włącz booking dla tej oferty'; end if;
end;
$function$;

revoke all on function market.seller_booking_save_extras(uuid,integer,integer,numeric,numeric,boolean) from public, anon;
grant execute on function market.seller_booking_save_extras(uuid,integer,integer,numeric,numeric,boolean) to authenticated, service_role;
