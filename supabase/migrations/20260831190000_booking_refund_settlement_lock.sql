-- Prevent seller payout and a full booking refund from running concurrently.

alter table market.seller_settlements drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements add constraint seller_settlements_status_check
  check (status = any(array['scheduled'::text,'pending'::text,'processing'::text,'settled'::text,'failed'::text,'refund_pending'::text,'cancelled'::text]));

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
  if exists(select 1 from market.seller_settlements s where s.order_id=o.id and s.status='processing') then
    raise exception 'Wypłata sprzedawcy jest właśnie przetwarzana — spróbuj anulować rezerwację ponownie po zakończeniu rozliczenia';
  end if;

  if coalesce(v.deposit_gross,0)>0 and coalesce(v.deposit_status,'not_charged') not in ('held','not_charged') then
    raise exception 'Kaucja została już osobno rozliczona — wymagane rozliczenie operatora';
  end if;

  select * into r from market.booking_refunds where booking_id=p_booking;
  if r.booking_id is not null and r.status='refunded' then
    return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),true;
    return;
  end if;

  update market.seller_settlements
     set status='refund_pending', last_error=null, updated_at=now()
   where order_id=o.id and status in ('scheduled','pending','failed');

  insert into market.booking_refunds(booking_id,order_id,status,amount_gross,payment_provider,last_error,updated_at)
  values(v.id,o.id,'preparing',o.total_gross,o.payment_provider,null,now())
  on conflict(booking_id) do update set status='preparing',amount_gross=excluded.amount_gross,payment_provider=excluded.payment_provider,last_error=null,updated_at=now();

  return query select v.id,o.id,o.buyer_id,o.payment_provider,o.stripe_session_id,o.total_gross,coalesce(v.deposit_gross,0),false;
end;
$$;

create or replace function market.booking_refund_abort(p_booking uuid, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r market.booking_refunds%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('booking-refund:'||p_booking::text,42));
  select * into r from market.booking_refunds where booking_id=p_booking for update;
  if r.booking_id is null then return jsonb_build_object('ok',true,'already',true); end if;
  if r.status='refunded' then return jsonb_build_object('ok',false,'reason','already_refunded'); end if;

  update market.seller_settlements
     set status=case when available_at is not null then 'scheduled' else 'pending' end,
         last_error=null,
         updated_at=now()
   where order_id=r.order_id and status='refund_pending';

  update market.booking_refunds
     set status='payment_failed', last_error=left(coalesce(p_error,'refund_aborted'),1000), updated_at=now()
   where booking_id=p_booking;
  return jsonb_build_object('ok',true,'order_id',r.order_id);
end;
$$;

revoke all on function market.booking_refund_abort(uuid,text) from public, anon, authenticated;
grant execute on function market.booking_refund_abort(uuid,text) to service_role;