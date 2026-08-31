create or replace function market.confirm_paid_booking(p_order_id uuid, p_payment_provider text)
returns uuid
language plpgsql
set search_path to 'market','public'
as $$
declare
  v_booking_id uuid;
  v_instant boolean := true;
begin
  if p_payment_provider not in ('sunrise_pay','stripe') then
    raise exception 'Nieprawidłowa metoda płatności';
  end if;

  select coalesce(bo.instant_booking,true)
    into v_instant
  from market.bookings b
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

create or replace function market.expire_booking_payment(p_booking_id uuid, p_order_id uuid)
returns void
language plpgsql
set search_path to 'market','public'
as $$
declare
  v_expired boolean := false;
begin
  update market.bookings
  set status='expired', updated_at=now()
  where id=p_booking_id
    and order_id=p_order_id
    and status='pending_payment'
    and paid_at is null;
  v_expired := found;

  if v_expired then
    update market.orders
    set status='cancelled'
    where id=p_order_id and status='created';
  end if;
end;
$$;

create or replace function market.release_unpaid_booking(p_booking_id uuid, p_order_id uuid)
returns void
language plpgsql
set search_path to 'market','public'
as $$
declare
  v_released boolean := false;
begin
  update market.bookings
  set status='held', order_id=null,
      hold_expires_at=now()+interval '15 minutes', updated_at=now()
  where id=p_booking_id
    and order_id=p_order_id
    and status='pending_payment'
    and paid_at is null;
  v_released := found;

  if v_released then
    delete from market.orders
    where id=p_order_id and status='created';
  end if;
end;
$$;

create or replace function market.seller_booking_set_status(p_booking uuid, p_status text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v market.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_status not in ('confirmed','cancelled','completed') then raise exception 'Nieprawidłowy status'; end if;
  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;

  if p_status='confirmed' then
    if v.status not in ('held','pending_payment') then raise exception 'Tej rezerwacji nie można potwierdzić'; end if;
    if v.amount_gross>0 and v.paid_at is null then raise exception 'Najpierw musi zostać potwierdzona płatność'; end if;
    update market.bookings set status='confirmed',hold_expires_at=null,updated_at=now() where id=p_booking;
  elsif p_status='cancelled' then
    if v.status in ('cancelled','completed','expired') then raise exception 'Tej rezerwacji nie można anulować'; end if;
    update market.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_booking;
  else
    if v.status<>'confirmed' then raise exception 'Tylko potwierdzoną rezerwację można zakończyć'; end if;
    update market.bookings set status='completed',updated_at=now() where id=p_booking;
  end if;
  return p_status;
end;
$$;