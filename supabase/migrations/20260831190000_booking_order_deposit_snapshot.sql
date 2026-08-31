create or replace function market.checkout_booking(p_buyer_id uuid, p_booking_id uuid)
returns uuid
language plpgsql
set search_path to 'market', 'public'
as $$
declare
  v_booking market.bookings%rowtype;
  v_offer market.offers%rowtype;
  v_order_id uuid;
  v_rate numeric;
  v_vat numeric;
  v_net numeric;
  v_model text;
  v_vat_treatment text;
  v_cashback_rate numeric:=coalesce((select pc.value::numeric from market.platform_config pc where pc.key='cashback_rate'),0);
begin
  select * into v_booking from market.bookings where id=p_booking_id for update;
  if v_booking.id is null or v_booking.buyer_id<>p_buyer_id then raise exception 'Nie znaleziono rezerwacji'; end if;
  if v_booking.status='pending_payment' and v_booking.order_id is not null and v_booking.hold_expires_at>now() then return v_booking.order_id; end if;
  if v_booking.status<>'held' or v_booking.hold_expires_at<=now() then raise exception 'Blokada terminu wygasła'; end if;
  select * into v_offer from market.offers where id=v_booking.offer_id and status='active';
  if v_offer.id is null or coalesce(v_offer.is_test,false) then raise exception 'Oferta jest niedostępna'; end if;
  v_model:=coalesce(v_offer.commission_model,'cashback_only');
  v_rate:=market.commission_rate_for(v_offer.category_id);
  if v_model<>'mlm_full' then select coalesce(s.commission_rate,v_rate) into v_rate from market.sellers s where s.id=v_offer.seller_id; end if;
  v_vat_treatment:=market.offer_vat_treatment(v_offer.attributes);
  v_vat:=market.offer_vat_rate(v_offer.attributes);
  v_net:=case when v_vat is null then null else round(v_booking.amount_gross/(1+v_vat/100),2) end;

  insert into market.orders(buyer_id,status,total_gross,cashback_amount,deposit_gross)
    values(
      p_buyer_id,
      'created',
      round(v_booking.amount_gross + coalesce(v_booking.deposit_gross,0),2),
      round(v_booking.amount_gross*v_cashback_rate,2),
      round(coalesce(v_booking.deposit_gross,0),2)
    ) returning id into v_order_id;

  insert into market.order_items(
    order_id,offer_id,seller_id,qty,unit_price_gross,line_gross,vat_rate,amount_net,vat_treatment_snapshot,
    commission_model_snapshot,ambassador_eligible,commission_rate,commission_amount,seller_payout
  ) values(
    v_order_id,v_booking.offer_id,v_booking.seller_id,v_booking.units,v_booking.unit_price_gross,v_booking.amount_gross,v_vat,v_net,v_vat_treatment,
    v_model,v_model='mlm_full',v_rate,round(v_booking.amount_gross*v_rate,2),round(v_booking.amount_gross*(1-v_rate),2)
  );
  update market.bookings set status='pending_payment',order_id=v_order_id,hold_expires_at=now()+interval '35 minutes',updated_at=now() where id=v_booking.id;
  return v_order_id;
end;
$$;

create or replace function market.confirm_paid_booking(p_order_id uuid, p_payment_provider text)
returns uuid
language plpgsql
set search_path to 'market', 'public'
as $$
declare
  v_booking_id uuid;
  v_instant boolean := true;
  v_order_deposit numeric := 0;
begin
  if p_payment_provider not in ('sunrise_pay','stripe') then
    raise exception 'Nieprawidłowa metoda płatności';
  end if;

  select coalesce(bo.instant_booking,true), coalesce(o.deposit_gross,0)
    into v_instant, v_order_deposit
  from market.bookings b
  join market.orders o on o.id=b.order_id
  left join market.booking_offers bo on bo.offer_id=b.offer_id
  where b.order_id=p_order_id;

  update market.bookings
  set status = case
        when status='confirmed' then 'confirmed'
        when v_instant then 'confirmed'
        else 'pending_payment'
      end,
      payment_provider = p_payment_provider,
      paid_at = coalesce(paid_at, now()),
      deposit_status = case
        when v_order_deposit > 0 and coalesce(deposit_gross,0) > 0 and deposit_status in ('not_charged','failed') then 'held'
        else deposit_status
      end,
      deposit_paid_at = case
        when v_order_deposit > 0 and coalesce(deposit_gross,0) > 0 then coalesce(deposit_paid_at, now())
        else deposit_paid_at
      end,
      hold_expires_at = case
        when status='confirmed' or v_instant then null
        else timestamptz '9999-12-31 23:59:59+00'
      end,
      updated_at = now()
  where order_id = p_order_id
    and status in ('pending_payment','confirmed')
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

comment on function market.confirm_paid_booking(uuid,text) is
'Marks a booking deposit held only when the paid order contains a positive deposit snapshot.';
