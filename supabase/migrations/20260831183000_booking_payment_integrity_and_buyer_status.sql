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
'Confirms main booking payment only. Deposit is a separate refundable liability and must not be marked paid until an actual deposit charge exists.';

create or replace function market.my_bookings_v2()
returns table(
  id uuid,
  offer_id uuid,
  title text,
  booking_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  units integer,
  amount_gross numeric,
  status text,
  order_id uuid,
  payment_provider text,
  paid_at timestamptz,
  hold_expires_at timestamptz,
  deposit_gross numeric,
  deposit_status text,
  deposit_paid_at timestamptz,
  deposit_resolved_at timestamptz,
  deposit_retained_gross numeric,
  deposit_resolution_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select b.id, b.offer_id, o.title, b.booking_type, b.starts_at, b.ends_at,
         b.units, b.amount_gross, b.status, b.order_id, b.payment_provider,
         b.paid_at, b.hold_expires_at, coalesce(b.deposit_gross,0),
         b.deposit_status, b.deposit_paid_at, b.deposit_resolved_at,
         coalesce(b.deposit_retained_gross,0), b.deposit_resolution_note,
         b.created_at
  from market.bookings b
  join market.offers o on o.id = b.offer_id
  where b.buyer_id = auth.uid()
  order by b.starts_at desc;
$$;

revoke all on function market.my_bookings_v2() from public;
grant execute on function market.my_bookings_v2() to authenticated;
