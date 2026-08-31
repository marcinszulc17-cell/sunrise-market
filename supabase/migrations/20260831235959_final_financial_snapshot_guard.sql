alter table market.order_items
  add column if not exists line_gross numeric,
  add column if not exists vat_rate numeric,
  add column if not exists amount_net numeric,
  add column if not exists commission_model_snapshot text not null default 'cashback_only',
  add column if not exists ambassador_eligible boolean not null default false;

alter table market.order_items drop constraint if exists order_items_vat_rate_check;
alter table market.order_items
  add constraint order_items_vat_rate_check
  check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100));

drop trigger if exists trg_offer_vat_backfill_pending on market.offers;
drop function if exists market.trg_offer_vat_backfill_pending();

create or replace function market.checkout(p_buyer_id uuid, p_items jsonb)
returns uuid
language plpgsql
set search_path to 'market','public','extensions'
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_offer record;
  v_rate numeric;
  v_line numeric;
  v_vat numeric;
  v_net numeric;
  v_model text;
  v_total numeric := 0;
  v_cashback_rate numeric := (select value::numeric from platform_config where key='cashback_rate');
begin
  insert into orders(buyer_id,status) values(p_buyer_id,'created') returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select o.*,c.id as cat into v_offer
      from offers o join categories c on c.id=o.category_id
      where o.id=(v_item->>'offer_id')::uuid and o.status='active';
    if not found then raise exception 'Oferta niedostepna: %',v_item->>'offer_id'; end if;
    if coalesce(v_offer.is_test,false) then raise exception 'Produkt testowy — chwilowo niedostepny do zakupu: %',v_offer.title; end if;
    if v_offer.stock < (v_item->>'qty')::int then raise exception 'Brak stanu: %',v_offer.title; end if;
    v_model:=coalesce(v_offer.commission_model,'cashback_only');
    v_rate:=market.commission_rate_for(v_offer.category_id);
    if v_model<>'mlm_full' then
      select coalesce(sl.commission_rate,v_rate) into v_rate from market.sellers sl where sl.id=v_offer.seller_id;
    end if;
    v_line:=v_offer.price_gross*(v_item->>'qty')::int;
    v_vat:=market.offer_vat_rate(v_offer.attributes);
    v_net:=case when v_vat is null then null else round(v_line/(1+v_vat/100),2) end;
    v_total:=v_total+v_line;
    insert into order_items(
      order_id,offer_id,seller_id,qty,unit_price_gross,line_gross,vat_rate,amount_net,
      commission_model_snapshot,ambassador_eligible,
      commission_rate,commission_amount,seller_payout
    ) values(
      v_order_id,v_offer.id,v_offer.seller_id,(v_item->>'qty')::int,v_offer.price_gross,round(v_line,2),v_vat,v_net,
      v_model,v_model='mlm_full',
      v_rate,round(v_line*v_rate,2),round(v_line*(1-v_rate),2)
    );
    update offers set stock=stock-(v_item->>'qty')::int where id=v_offer.id;
  end loop;
  update orders set total_gross=v_total,cashback_amount=round(v_total*v_cashback_rate,2) where id=v_order_id;
  return v_order_id;
end;
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
  v_vat numeric;
  v_net numeric;
  v_model text;
  v_cashback_rate numeric := coalesce((select pc.value::numeric from market.platform_config pc where pc.key='cashback_rate'),0);
begin
  select * into v_booking
  from market.bookings
  where id=p_booking_id
  for update;

  if v_booking.id is null or v_booking.buyer_id<>p_buyer_id then
    raise exception 'Nie znaleziono rezerwacji';
  end if;
  if v_booking.status='pending_payment' and v_booking.order_id is not null and v_booking.hold_expires_at>now() then
    return v_booking.order_id;
  end if;
  if v_booking.status<>'held' or v_booking.hold_expires_at<=now() then
    raise exception 'Blokada terminu wygasła';
  end if;

  select * into v_offer
  from market.offers
  where id=v_booking.offer_id and status='active';
  if v_offer.id is null or coalesce(v_offer.is_test,false) then
    raise exception 'Oferta jest niedostępna';
  end if;

  v_model:=coalesce(v_offer.commission_model,'cashback_only');
  v_rate:=market.commission_rate_for(v_offer.category_id);
  if v_model<>'mlm_full' then
    select coalesce(s.commission_rate,v_rate) into v_rate
    from market.sellers s where s.id=v_offer.seller_id;
  end if;

  v_vat:=market.offer_vat_rate(v_offer.attributes);
  v_net:=case when v_vat is null then null else round(v_booking.amount_gross/(1+v_vat/100),2) end;

  insert into market.orders(buyer_id,status,total_gross,cashback_amount)
  values(p_buyer_id,'created',v_booking.amount_gross,round(v_booking.amount_gross*v_cashback_rate,2))
  returning id into v_order_id;

  insert into market.order_items(
    order_id,offer_id,seller_id,qty,unit_price_gross,line_gross,vat_rate,amount_net,
    commission_model_snapshot,ambassador_eligible,
    commission_rate,commission_amount,seller_payout
  ) values(
    v_order_id,v_booking.offer_id,v_booking.seller_id,v_booking.units,v_booking.unit_price_gross,
    v_booking.amount_gross,v_vat,v_net,v_model,v_model='mlm_full',
    v_rate,round(v_booking.amount_gross*v_rate,2),round(v_booking.amount_gross*(1-v_rate),2)
  );

  update market.bookings
  set status='pending_payment',order_id=v_order_id,hold_expires_at=now()+interval '35 minutes',updated_at=now()
  where id=v_booking.id;

  return v_order_id;
end;
$$;

create or replace function market.enqueue_ambassador_commission(p_order uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order market.orders%rowtype;
  v_email text;
  v_count integer := 0;
  v_missing_vat integer := 0;
  v_all_gross numeric := 0;
  v_discount_ratio numeric := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_payload jsonb := '[]'::jsonb;
  v_status text;
  v_reason text;
begin
  select * into v_order from market.orders where id=p_order;
  if v_order.id is null or v_order.status<>'paid' then return; end if;

  select u.email::text into v_email from auth.users u where u.id=v_order.buyer_id;

  select coalesce(sum(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)),0)
  into v_all_gross
  from market.order_items oi
  where oi.order_id=p_order;

  v_discount_ratio:=case
    when v_all_gross>0 then least(1,greatest(0,coalesce(v_order.discount_amount,0)/v_all_gross))
    else 0
  end;

  select count(*)::integer,
         count(*) filter(where oi.vat_rate is null)::integer,
         coalesce(sum(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio)),0),
         coalesce(sum(case when oi.vat_rate is null then 0 else (coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio))/(1+oi.vat_rate/100) end),0),
         coalesce(jsonb_agg(jsonb_build_object(
           'order_item_id',oi.id,
           'offer_id',oi.offer_id,
           'gross_before_discount',coalesce(oi.line_gross,oi.qty*oi.unit_price_gross),
           'discount_ratio',v_discount_ratio,
           'eligible_gross',round(coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio),2),
           'vat_rate',oi.vat_rate,
           'eligible_net',case when oi.vat_rate is null then null else round((coalesce(oi.line_gross,oi.qty*oi.unit_price_gross)*(1-v_discount_ratio))/(1+oi.vat_rate/100),2) end,
           'commission_model',oi.commission_model_snapshot
         ) order by oi.id),'[]'::jsonb)
  into v_count,v_missing_vat,v_gross,v_net,v_payload
  from market.order_items oi
  where oi.order_id=p_order and oi.ambassador_eligible=true;

  if v_count=0 then return; end if;

  if coalesce(v_email,'')='' then
    v_status:='pending_identity'; v_reason:='Brak adresu e-mail kupującego';
  elsif v_missing_vat>0 then
    v_status:='pending_vat'; v_reason:='Brak stawki VAT na co najmniej jednej pozycji prowizyjnej';
  else
    v_status:='ready'; v_reason:=null;
  end if;

  insert into market.ambassador_commission_outbox(
    order_id,buyer_id,buyer_email,eligible_gross,amount_net,status,reason,payload,updated_at
  ) values(
    v_order.id,v_order.buyer_id,v_email,round(v_gross,2),
    case when v_missing_vat=0 then round(v_net,2) else null end,
    v_status,v_reason,
    jsonb_build_object(
      'source','sunrise_market',
      'order_id',v_order.id,
      'order_discount_gross',coalesce(v_order.discount_amount,0),
      'discount_ratio',v_discount_ratio,
      'items',v_payload
    ),now()
  )
  on conflict(order_id) do update set
    buyer_email=excluded.buyer_email,
    eligible_gross=excluded.eligible_gross,
    amount_net=excluded.amount_net,
    status=case when market.ambassador_commission_outbox.status='sent' then 'sent' else excluded.status end,
    reason=case when market.ambassador_commission_outbox.status='sent' then market.ambassador_commission_outbox.reason else excluded.reason end,
    payload=case when market.ambassador_commission_outbox.status='sent' then market.ambassador_commission_outbox.payload else excluded.payload end,
    updated_at=now();
end;
$$;

revoke all on function market.checkout(uuid,jsonb) from public;
revoke execute on function market.checkout(uuid,jsonb) from anon,authenticated;
grant execute on function market.checkout(uuid,jsonb) to service_role;

revoke all on function market.checkout_booking(uuid,uuid) from public;
revoke execute on function market.checkout_booking(uuid,uuid) from anon,authenticated;
grant execute on function market.checkout_booking(uuid,uuid) to service_role;

revoke all on function market.enqueue_ambassador_commission(uuid) from public;
revoke execute on function market.enqueue_ambassador_commission(uuid) from anon,authenticated;
grant execute on function market.enqueue_ambassador_commission(uuid) to service_role;
