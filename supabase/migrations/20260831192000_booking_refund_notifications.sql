-- Keep booking refund communication inside the existing Market notification system.
create or replace function market.booking_refund_finalize(p_booking uuid, p_external_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r market.booking_refunds%rowtype;
  v market.bookings%rowtype;
  v_seller_user uuid;
  v_buyer_body text;
begin
  perform pg_advisory_xact_lock(hashtextextended('booking-refund:'||p_booking::text,42));
  select * into r from market.booking_refunds where booking_id=p_booking for update;
  if r.booking_id is null then raise exception 'Refund nie został przygotowany'; end if;
  if r.status='refunded' then return jsonb_build_object('ok',true,'already',true,'order_id',r.order_id); end if;
  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;

  update market.bookings set
    status='cancelled',
    cancelled_at=coalesce(cancelled_at,now()),
    hold_expires_at=null,
    deposit_status=case when coalesce(deposit_gross,0)>0 then 'refunded' else deposit_status end,
    deposit_resolved_at=case when coalesce(deposit_gross,0)>0 then now() else deposit_resolved_at end,
    deposit_retained_gross=case when coalesce(deposit_gross,0)>0 then 0 else deposit_retained_gross end,
    deposit_resolution_note=case when coalesce(deposit_gross,0)>0 then 'Zwrot pełnej płatności przy anulowaniu rezerwacji' else deposit_resolution_note end,
    updated_at=now()
  where id=p_booking;

  update market.orders set status='cancelled' where id=r.order_id and status in ('paid','created');
  update market.seller_settlements set status='cancelled',last_error='Anulowana opłacona rezerwacja — zwrot klientowi',updated_at=now()
    where order_id=r.order_id and status<>'settled';
  update market.ambassador_commission_outbox set status='reversed',updated_at=now()
    where order_id=r.order_id and status in ('ready','sent','failed','pending_vat','pending_identity');

  update market.booking_refunds set status='refunded',external_ref=p_external_ref,last_error=null,refunded_at=now(),updated_at=now() where booking_id=p_booking;

  v_buyer_body := case when r.payment_provider='stripe'
    then 'Rezerwacja została anulowana. Zwrot '||round(r.amount_gross,2)||' zł został wysłany na metodę płatności używaną przy zakupie. Księgowanie po stronie banku może potrwać kilka dni. Powiązany cashback został cofnięty.'
    else 'Rezerwacja została anulowana. Zwrot '||round(r.amount_gross,2)||' zł został zaksięgowany w Sunrise Pay. Powiązany cashback został cofnięty.'
  end;
  perform market.notify(v.buyer_id,'booking_refunded','Rezerwacja anulowana — zwrot wykonany',v_buyer_body);

  select coalesce((select u.id from auth.users u join market.sellers s on lower(s.email)=lower(u.email) where s.id=v.seller_id limit 1), v.seller_id)
    into v_seller_user;
  perform market.notify(v_seller_user,'booking_refunded_seller','Rezerwacja anulowana i zwrócona','Klient otrzymał zwrot '||round(r.amount_gross,2)||' zł. Planowana wypłata sprzedawcy dla tej rezerwacji została anulowana.');

  return jsonb_build_object('ok',true,'order_id',r.order_id,'amount_gross',r.amount_gross);
end;
$$;

revoke all on function market.booking_refund_finalize(uuid,text) from public;
grant execute on function market.booking_refund_finalize(uuid,text) to service_role;

create or replace function market.notify_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare v_buyer uuid; v_total numeric; r record; v_suser uuid;
begin
  select buyer_id,total_gross into v_buyer,v_total from market.orders where id=p_order;
  perform market.notify(v_buyer,'order_paid','Zamówienie opłacone','Dziękujemy! Zapłacono '||v_total||' zł. Cashback został naliczony w punktach MySunrise.');
  for r in select oi.seller_id,sum(oi.seller_payout) net from market.order_items oi where oi.order_id=p_order group by oi.seller_id loop
    select coalesce((select u.id from auth.users u join market.sellers s on lower(s.email)=lower(u.email) where s.id=r.seller_id limit 1),r.seller_id) into v_suser;
    perform market.notify(v_suser,'new_sale','Nowa sprzedaż!','Sprzedano Twoją ofertę. Do rozliczenia sprzedawcy przypisano '||round(r.net,2)||' zł po prowizji platformy.');
  end loop;
end;
$$;