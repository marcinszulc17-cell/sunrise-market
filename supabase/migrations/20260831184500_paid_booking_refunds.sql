-- Bezpieczne anulowanie opłaconych rezerwacji:
-- zwykłe anulowanie blokowane, pełny refund ma osobny audytowalny workflow.

create table if not exists market.booking_refunds (
  booking_id uuid primary key references market.bookings(id) on delete restrict,
  order_id uuid not null references market.orders(id) on delete restrict,
  status text not null check (status in ('preparing','blocked_bonus','payment_failed','refunded','finalize_failed')),
  amount_gross numeric not null check (amount_gross >= 0),
  payment_provider text not null,
  external_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_at timestamptz
);

alter table market.ambassador_commission_outbox drop constraint if exists ambassador_commission_outbox_status_check;
alter table market.ambassador_commission_outbox add constraint ambassador_commission_outbox_status_check
  check (status = any(array['ready'::text,'pending_vat'::text,'pending_identity'::text,'sent'::text,'failed'::text,'reversed'::text]));

alter table market.seller_settlements drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements add constraint seller_settlements_status_check
  check (status = any(array['scheduled'::text,'pending'::text,'settled'::text,'failed'::text,'cancelled'::text]));

create or replace function market.seller_booking_set_status(p_booking uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v market.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_status not in ('confirmed','cancelled','completed','no_show') then raise exception 'Nieprawidłowy status'; end if;

  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;

  if p_status='confirmed' then
    if v.status not in ('held','pending_payment') then raise exception 'Tej rezerwacji nie można potwierdzić'; end if;
    if v.amount_gross>0 and v.paid_at is null then raise exception 'Najpierw musi zostać potwierdzona płatność'; end if;
    update market.bookings set status='confirmed',hold_expires_at=null,updated_at=now() where id=p_booking;
  elsif p_status='cancelled' then
    if v.status in ('cancelled','completed','expired','no_show') then raise exception 'Tej rezerwacji nie można anulować'; end if;
    if v.paid_at is not null then raise exception 'Opłaconą rezerwację anuluj przez zwrot płatności.'; end if;
    update market.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_booking;
  elsif p_status='completed' then
    if v.status<>'confirmed' then raise exception 'Tylko potwierdzoną rezerwację można zakończyć'; end if;
    update market.bookings set status='completed',updated_at=now() where id=p_booking;
  else
    if v.booking_type<>'appointment' then raise exception 'Status nieobecności dotyczy wizyt godzinowych'; end if;
    if v.status<>'confirmed' then raise exception 'Tylko potwierdzoną rezerwację można oznaczyć jako nieobecność'; end if;
    if v.starts_at>now() then raise exception 'Nie można oznaczyć nieobecności przed rozpoczęciem terminu'; end if;
    update market.bookings set status='no_show',updated_at=now() where id=p_booking;
  end if;

  return p_status;
end;
$$;

create or replace function market.seller_booking_refund_prepare(p_booking uuid)
returns table(
  booking_id uuid,
  order_id uuid,
  buyer_id uuid,
  payment_provider text,
  stripe_session_id text,
  amount_gross numeric,
  deposit_gross numeric,
  already_refunded boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v market.bookings%rowtype;
  o market.orders%rowtype;
  r market.booking_refunds%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-refund:'||p_booking::text,42));

  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v.status in ('cancelled','completed','expired','no_show') then raise exception 'Tej rezerwacji nie można zwrócić'; end if;
  if v.paid_at is null or v.order_id is null then raise exception 'Rezerwacja nie jest opłacona'; end if;

  select * into o from market.orders where id=v.order_id for update;
  if o.id is null then raise exception 'Brak zamówienia rezerwacji'; end if;
  if o.status not in ('paid','created') then raise exception 'Zamówienie nie jest w stanie możliwym do zwrotu'; end if;
  if o.payment_provider not in ('sunrise_pay','stripe') then raise exception 'Nieobsługiwana metoda płatności'; end if;

  if exists(select 1 from market.seller_settlements s where s.order_id=o.id and s.status='settled') then
    raise exception 'Wypłata sprzedawcy została już rozliczona — wymagane rozliczenie operatora';
  end if;

  if coalesce(v.deposit_gross,0)>0 and coalesce(v.deposit_status,'not_charged') not in ('held','not_charged') then
    raise exception 'Kaucja została już osobno rozliczona — wymagane rozliczenie operatora';
  end if;

  select * into r from market.booking_refunds where booking_id=p_booking;
  if r.booking_id is not null and r.status='refunded' then
    return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),true;
    return;
  end if;

  insert into market.booking_refunds(booking_id,order_id,status,amount_gross,payment_provider,last_error,updated_at)
  values(v.id,o.id,'preparing',o.total_gross,o.payment_provider,null,now())
  on conflict(booking_id) do update set status='preparing',amount_gross=excluded.amount_gross,payment_provider=excluded.payment_provider,last_error=null,updated_at=now();

  return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),false;
end;
$$;

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
  update market.seller_settlements set status='cancelled',last_error='Anulowana opłacona rezerwacja — zwrot klientowi',updated_at=now()
    where order_id=r.order_id and status<>'settled';
  update market.ambassador_commission_outbox set status='reversed',updated_at=now()
    where order_id=r.order_id and status in ('sent','failed','pending_vat','pending_identity');

  update market.booking_refunds set status='refunded',external_ref=p_external_ref,last_error=null,refunded_at=now(),updated_at=now() where booking_id=p_booking;
  return jsonb_build_object('ok',true,'order_id',r.order_id,'amount_gross',r.amount_gross);
end;
$$;

revoke all on function market.seller_booking_refund_prepare(uuid) from public;
grant execute on function market.seller_booking_refund_prepare(uuid) to authenticated;
revoke all on function market.booking_refund_finalize(uuid,text) from public;
grant execute on function market.booking_refund_finalize(uuid,text) to service_role;
