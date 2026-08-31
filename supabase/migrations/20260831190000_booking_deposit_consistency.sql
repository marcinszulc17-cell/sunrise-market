create or replace function market.confirm_paid_booking(p_order_id uuid, p_payment_provider text)
returns uuid
language plpgsql
set search_path to 'market', 'public'
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
      deposit_status = case
        when coalesce(deposit_gross,0) > 0 and deposit_status in ('not_charged','failed') then 'held'
        else deposit_status
      end,
      deposit_paid_at = case
        when coalesce(deposit_gross,0) > 0 then coalesce(deposit_paid_at, now())
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
'Confirms a paid booking. checkout_booking includes deposit_gross in orders.total_gross, so a positive deposit becomes held and records deposit_paid_at after successful Sunrise Pay or Stripe payment.';
