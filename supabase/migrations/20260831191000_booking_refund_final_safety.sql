-- Final refund safety: freeze seller payout before external refund work and restore it on failure.
-- Automatic refunds are only allowed before the booking starts, for a paid order,
-- before seller settlement, and while any refundable deposit is still held.

alter table market.seller_settlements drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements add constraint seller_settlements_status_check
  check (status = any(array['scheduled'::text,'pending'::text,'settled'::text,'failed'::text,'refund_pending'::text,'cancelled'::text]));

drop function if exists market.seller_booking_refund_prepare(uuid);
create function market.seller_booking_refund_prepare(p_booking uuid)
returns table(booking_id uuid,order_id uuid,buyer_id uuid,payment_provider text,stripe_session_id text,amount_gross numeric,deposit_gross numeric,already_refunded boolean)
language plpgsql security definer set search_path=''
as $$
declare v market.bookings%rowtype; o market.orders%rowtype; r market.booking_refunds%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-refund:'||p_booking::text,42));
  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v.status in ('cancelled','completed','expired','no_show') then raise exception 'Tej rezerwacji nie można zwrócić'; end if;
  if v.paid_at is null or v.order_id is null then raise exception 'Rezerwacja nie jest opłacona'; end if;
  if v.starts_at<=now() then raise exception 'Po rozpoczęciu terminu automatyczny zwrot jest zablokowany — wymagane rozliczenie operatora'; end if;
  select * into o from market.orders where id=v.order_id for update;
  if o.id is null then raise exception 'Brak zamówienia rezerwacji'; end if;
  if o.status<>'paid' then raise exception 'Zamówienie nie ma statusu opłaconego'; end if;
  if o.payment_provider not in ('sunrise_pay','stripe') then raise exception 'Nieobsługiwana metoda płatności'; end if;
  if exists(select 1 from market.seller_settlements s where s.order_id=o.id and s.status='settled') then raise exception 'Wypłata sprzedawcy została już rozliczona — wymagane rozliczenie operatora'; end if;
  if coalesce(v.deposit_gross,0)>0 and coalesce(v.deposit_status,'not_charged')<>'held' then raise exception 'Kaucja została już osobno rozliczona — wymagane rozliczenie operatora'; end if;
  select * into r from market.booking_refunds where booking_id=p_booking;
  if r.booking_id is not null and r.status='refunded' then return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),true; return; end if;
  update market.seller_settlements set status='refund_pending',last_error=null,updated_at=now() where order_id=o.id and status in ('scheduled','pending','failed');
  insert into market.booking_refunds(booking_id,order_id,status,amount_gross,payment_provider,last_error,updated_at)
  values(v.id,o.id,'preparing',o.total_gross,o.payment_provider,null,now())
  on conflict(booking_id) do update set status='preparing',amount_gross=excluded.amount_gross,payment_provider=excluded.payment_provider,last_error=null,updated_at=now();
  return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),false;
end $$;
revoke all on function market.seller_booking_refund_prepare(uuid) from public;
grant execute on function market.seller_booking_refund_prepare(uuid) to authenticated;