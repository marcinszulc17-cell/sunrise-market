-- Keep booking checkout and buyer booking UX on the same platform cashback rate.

create or replace function market.booking_public_catalog(p_offer uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'market','public'
as $$
select jsonb_build_object(
  'config', jsonb_build_object(
    'offer_id', b.offer_id,
    'booking_type', b.booking_type,
    'timezone', b.timezone,
    'duration_minutes', b.duration_minutes,
    'slot_interval_minutes', b.slot_interval_minutes,
    'min_notice_hours', b.min_notice_hours,
    'max_advance_days', b.max_advance_days,
    'min_units', b.min_units,
    'max_units', b.max_units,
    'price_per_unit', coalesce(b.price_per_unit,o.price_gross),
    'cleaning_fee_gross', b.cleaning_fee_gross,
    'deposit_gross', b.deposit_gross,
    'instant_booking', b.instant_booking,
    'cashback_rate', coalesce((select pc.value::numeric from market.platform_config pc where pc.key='cashback_rate'),0)
  ),
  'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,
      'price_gross',s.price_gross,'buffer_before_minutes',s.buffer_before_minutes,'buffer_after_minutes',s.buffer_after_minutes
    ) order by s.sort,s.name) from market.booking_services s where s.offer_id=b.offer_id and s.active),'[]'::jsonb),
  'resources', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'kind',r.kind,'description',r.description) order by r.name)
    from market.booking_offer_resources x join market.booking_resources r on r.id=x.resource_id and r.active where x.offer_id=b.offer_id),'[]'::jsonb),
  'rates', coalesce((select jsonb_agg(jsonb_build_object('id',rr.id,'starts_on',rr.starts_on,'ends_on',rr.ends_on,'price_per_unit',rr.price_per_unit,'min_units',rr.min_units,'label',rr.label) order by rr.starts_on,rr.priority desc)
    from market.booking_rate_rules rr where rr.offer_id=b.offer_id and rr.active),'[]'::jsonb)
)
from market.booking_offers b
join market.offers o on o.id=b.offer_id and o.status='active'
join market.sellers se on se.id=b.seller_id and se.status='active'
where b.offer_id=p_offer and b.active;
$$;

create or replace function market.checkout_booking(p_buyer_id uuid, p_booking_id uuid)
returns uuid
language plpgsql
set search_path to 'market','public'
as $$
declare
  v_booking market.bookings%rowtype;
  v_offer market.offers%rowtype;
  v_order_id uuid;
  v_rate numeric;
  v_cashback_rate numeric := coalesce((select pc.value::numeric from market.platform_config pc where pc.key='cashback_rate'),0);
begin
  select * into v_booking from market.bookings where id=p_booking_id for update;
  if v_booking.id is null or v_booking.buyer_id<>p_buyer_id then raise exception 'Nie znaleziono rezerwacji'; end if;
  if v_booking.status='pending_payment' and v_booking.order_id is not null and v_booking.hold_expires_at>now() then return v_booking.order_id; end if;
  if v_booking.status<>'held' or v_booking.hold_expires_at<=now() then raise exception 'Blokada terminu wygasła'; end if;

  select * into v_offer from market.offers where id=v_booking.offer_id and status='active';
  if v_offer.id is null or coalesce(v_offer.is_test,false) then raise exception 'Oferta jest niedostępna'; end if;

  v_rate:=market.commission_rate_for(v_offer.category_id);
  if coalesce(v_offer.commission_model,'cashback_only')<>'mlm_full' then
    select coalesce(s.commission_rate,v_rate) into v_rate from market.sellers s where s.id=v_offer.seller_id;
  end if;

  insert into market.orders(buyer_id,status,total_gross,cashback_amount)
  values(p_buyer_id,'created',v_booking.amount_gross,round(v_booking.amount_gross*v_cashback_rate,2))
  returning id into v_order_id;

  insert into market.order_items(order_id,offer_id,seller_id,qty,unit_price_gross,commission_rate,commission_amount,seller_payout)
  values(v_order_id,v_booking.offer_id,v_booking.seller_id,v_booking.units,v_booking.unit_price_gross,v_rate,
    round(v_booking.amount_gross*v_rate,2),round(v_booking.amount_gross*(1-v_rate),2));

  update market.bookings set status='pending_payment',order_id=v_order_id,
    hold_expires_at=now()+interval '35 minutes',updated_at=now() where id=v_booking.id;
  return v_order_id;
end;
$$;

revoke all on function market.checkout_booking(uuid,uuid) from public,anon,authenticated;
grant execute on function market.checkout_booking(uuid,uuid) to service_role;
