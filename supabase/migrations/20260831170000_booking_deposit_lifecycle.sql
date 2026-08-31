begin;

alter table market.bookings add column if not exists deposit_status text not null default 'not_charged';
alter table market.bookings add column if not exists deposit_paid_at timestamptz;
alter table market.bookings add column if not exists deposit_resolved_at timestamptz;
alter table market.bookings add column if not exists deposit_retained_gross numeric not null default 0;
alter table market.bookings add column if not exists deposit_resolution_note text;
alter table market.orders add column if not exists stripe_payment_intent text;
alter table market.orders add column if not exists deposit_gross numeric not null default 0;

do $$ begin alter table market.bookings add constraint bookings_deposit_status_chk check (deposit_status in ('not_charged','held','refunding','refunded','retaining','retained','failed')); exception when duplicate_object then null; end $$;
do $$ begin alter table market.bookings add constraint bookings_deposit_retained_chk check (deposit_retained_gross >= 0 and deposit_retained_gross <= coalesce(deposit_gross,0)); exception when duplicate_object then null; end $$;
do $$ begin alter table market.orders add constraint orders_deposit_gross_chk check (deposit_gross >= 0); exception when duplicate_object then null; end $$;

create or replace function market.confirm_paid_booking(p_order_id uuid, p_payment_provider text)
returns uuid language plpgsql set search_path to 'market','public' as $$
declare v_booking_id uuid; v_instant boolean := true;
begin
  if p_payment_provider not in ('sunrise_pay','stripe') then raise exception 'Nieprawidłowa metoda płatności'; end if;
  select coalesce(bo.instant_booking,true) into v_instant from market.bookings b left join market.booking_offers bo on bo.offer_id=b.offer_id where b.order_id=p_order_id;
  update market.bookings set
    status=case when status='confirmed' then 'confirmed' when v_instant then 'confirmed' else 'pending_payment' end,
    payment_provider=p_payment_provider, paid_at=coalesce(paid_at,now()),
    deposit_status=case when coalesce(deposit_gross,0)>0 and deposit_status='not_charged' then 'held' else deposit_status end,
    deposit_paid_at=case when coalesce(deposit_gross,0)>0 then coalesce(deposit_paid_at,now()) else deposit_paid_at end,
    hold_expires_at=case when status='confirmed' or v_instant then null else timestamptz '9999-12-31 23:59:59+00' end,
    updated_at=now()
  where order_id=p_order_id and status in ('pending_payment','confirmed') returning id into v_booking_id;
  return v_booking_id;
end; $$;

create or replace function market.checkout_booking(p_buyer_id uuid, p_booking_id uuid)
returns uuid language plpgsql set search_path to 'market','public' as $$
declare
  v_booking market.bookings%rowtype; v_offer market.offers%rowtype; v_order_id uuid; v_rate numeric; v_vat numeric; v_net numeric;
  v_model text; v_vat_treatment text;
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
  v_vat_treatment:=market.offer_vat_treatment(v_offer.attributes); v_vat:=market.offer_vat_rate(v_offer.attributes);
  v_net:=case when v_vat is null then null else round(v_booking.amount_gross/(1+v_vat/100),2) end;
  insert into market.orders(buyer_id,status,total_gross,cashback_amount,deposit_gross)
    values(p_buyer_id,'created',round(v_booking.amount_gross+coalesce(v_booking.deposit_gross,0),2),round(v_booking.amount_gross*v_cashback_rate,2),round(coalesce(v_booking.deposit_gross,0),2)) returning id into v_order_id;
  insert into market.order_items(order_id,offer_id,seller_id,qty,unit_price_gross,line_gross,vat_rate,amount_net,vat_treatment_snapshot,commission_model_snapshot,ambassador_eligible,commission_rate,commission_amount,seller_payout)
    values(v_order_id,v_booking.offer_id,v_booking.seller_id,v_booking.units,v_booking.unit_price_gross,v_booking.amount_gross,v_vat,v_net,v_vat_treatment,v_model,v_model='mlm_full',v_rate,round(v_booking.amount_gross*v_rate,2),round(v_booking.amount_gross*(1-v_rate),2));
  update market.bookings set status='pending_payment',order_id=v_order_id,hold_expires_at=now()+interval '35 minutes',updated_at=now() where id=v_booking.id;
  return v_order_id;
end; $$;

create or replace function market.normalize_booking_order_financials()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_booking market.bookings%rowtype; v_cashback_rate numeric:=0;
begin
  select b.* into v_booking from market.bookings b where b.order_id=new.id limit 1;
  if v_booking.id is null then return new; end if;
  select coalesce(pc.value::numeric,0) into v_cashback_rate from market.platform_config pc where pc.key='cashback_rate';
  new.deposit_gross:=round(coalesce(v_booking.deposit_gross,0),2);
  new.total_gross:=round(coalesce(v_booking.amount_gross,0)+coalesce(v_booking.deposit_gross,0),2);
  new.cashback_amount:=round(coalesce(v_booking.amount_gross,0)*coalesce(v_cashback_rate,0),2);
  new.shipping_cost:=0; new.shipping_method:=null; new.coupon_code:=null; new.discount_amount:=0;
  return new;
end; $$;

drop trigger if exists normalize_booking_order_financials on market.orders;
create trigger normalize_booking_order_financials before update on market.orders for each row execute function market.normalize_booking_order_financials();

drop function if exists market.seller_booking_dashboard_v2();
create function market.seller_booking_dashboard_v2()
returns table(id uuid,offer_id uuid,title text,buyer_id uuid,buyer_name text,buyer_email text,booking_type text,starts_at timestamptz,ends_at timestamptz,units integer,amount_gross numeric,status text,order_id uuid,payment_provider text,paid_at timestamptz,hold_expires_at timestamptz,created_at timestamptz,service_id uuid,resource_id uuid,resource_name text,resource_kind text,deposit_gross numeric,deposit_status text,deposit_paid_at timestamptz,deposit_resolved_at timestamptz,deposit_retained_gross numeric,deposit_resolution_note text)
language sql stable security definer set search_path to '' as $$
  select b.id,b.offer_id,o.title,b.buyer_id,nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')),'')::text,u.email::text,b.booking_type,b.starts_at,b.ends_at,b.units,b.amount_gross,b.status,b.order_id,b.payment_provider,b.paid_at,b.hold_expires_at,b.created_at,b.service_id,b.resource_id,r.name::text,r.kind::text,coalesce(b.deposit_gross,0),b.deposit_status,b.deposit_paid_at,b.deposit_resolved_at,coalesce(b.deposit_retained_gross,0),b.deposit_resolution_note
  from market.bookings b join market.offers o on o.id=b.offer_id left join auth.users u on u.id=b.buyer_id left join market.booking_resources r on r.id=b.resource_id
  where b.seller_id=market.current_seller_id() or market.is_operator() order by b.starts_at desc;
$$;
grant execute on function market.seller_booking_dashboard_v2() to authenticated;

create or replace function market.seller_booking_deposit_prepare(p_booking uuid,p_action text)
returns table(booking_id uuid,order_id uuid,buyer_email text,seller_email text,payment_provider text,stripe_session_id text,deposit_gross numeric,deposit_status text)
language plpgsql security definer set search_path to '' as $$
declare v market.bookings%rowtype; v_order market.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_action not in ('refund','retain') then raise exception 'Nieprawidłowa akcja kaucji'; end if;
  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if coalesce(v.deposit_gross,0)<=0 then raise exception 'Ta rezerwacja nie ma kaucji'; end if;
  if v.deposit_status not in ('held','failed') then raise exception 'Kaucja nie jest gotowa do rozliczenia'; end if;
  if p_action='refund' and v.status not in ('cancelled','completed','no_show') then raise exception 'Kaucję można zwrócić po anulowaniu albo zakończeniu rezerwacji'; end if;
  if p_action='retain' and v.status not in ('completed','no_show') then raise exception 'Kaucję można zatrzymać po zakończeniu rezerwacji'; end if;
  select * into v_order from market.orders where id=v.order_id;
  if v_order.id is null or v_order.status<>'paid' then raise exception 'Brak opłaconego zamówienia'; end if;
  update market.bookings set deposit_status=case when p_action='refund' then 'refunding' else 'retaining' end,deposit_resolution_note=null,updated_at=now() where id=v.id;
  return query select v.id,v.order_id,bu.email::text,se.email::text,v.payment_provider,v_order.stripe_session_id,round(v.deposit_gross,2),case when p_action='refund' then 'refunding' else 'retaining' end from auth.users bu join market.sellers se on se.id=v.seller_id where bu.id=v.buyer_id;
end; $$;
revoke all on function market.seller_booking_deposit_prepare(uuid,text) from public;
grant execute on function market.seller_booking_deposit_prepare(uuid,text) to authenticated;

commit;
