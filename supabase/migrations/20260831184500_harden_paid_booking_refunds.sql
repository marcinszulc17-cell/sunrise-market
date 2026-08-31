-- Harden the already-merged paid booking refund flow without changing its public behavior.

alter table market.booking_refunds enable row level security;
revoke all on table market.booking_refunds from anon, authenticated;

create or replace function market.booking_refund_finalize(p_booking uuid, p_external_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r market.booking_refunds%rowtype;
  v market.bookings%rowtype;
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
  update market.seller_settlements
    set status='cancelled',last_error='Anulowana opłacona rezerwacja — zwrot klientowi',updated_at=now()
    where order_id=r.order_id and status<>'settled';
  update market.ambassador_commission_outbox
    set status='reversed',reason='Prowizje cofnięte po zwrocie opłaconej rezerwacji',updated_at=now()
    where order_id=r.order_id and status in ('ready','sent','failed','pending_vat','pending_identity');

  update market.booking_refunds
    set status='refunded',external_ref=p_external_ref,last_error=null,refunded_at=now(),updated_at=now()
    where booking_id=p_booking;
  return jsonb_build_object('ok',true,'order_id',r.order_id,'amount_gross',r.amount_gross);
end;
$$;

revoke all on function market.booking_refund_finalize(uuid,text) from public;
grant execute on function market.booking_refund_finalize(uuid,text) to service_role;
