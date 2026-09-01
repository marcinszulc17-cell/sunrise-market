create or replace function market.normalize_booking_order_financials()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking market.bookings%rowtype;
  v_cashback_rate numeric:=0;
begin
  -- Stripe has already charged the amount at this point. A status-only transition
  -- from created to paid must not recalculate financial fields or be blocked by
  -- booking/config normalization side effects.
  if old.status is distinct from 'paid' and new.status='paid'
     and new.total_gross is not distinct from old.total_gross
     and new.deposit_gross is not distinct from old.deposit_gross
     and new.shipping_cost is not distinct from old.shipping_cost
     and new.cashback_amount is not distinct from old.cashback_amount
     and new.discount_amount is not distinct from old.discount_amount
     and new.coupon_code is not distinct from old.coupon_code
     and new.shipping_method is not distinct from old.shipping_method then
    return new;
  end if;

  select b.* into v_booking from market.bookings b where b.order_id=new.id limit 1;
  if v_booking.id is null then return new; end if;
  select coalesce(pc.value::numeric,0) into v_cashback_rate from market.platform_config pc where pc.key='cashback_rate';
  new.deposit_gross:=round(coalesce(v_booking.deposit_gross,0),2);
  new.total_gross:=round(coalesce(v_booking.amount_gross,0)+coalesce(v_booking.deposit_gross,0),2);
  new.cashback_amount:=round(coalesce(v_booking.amount_gross,0)*coalesce(v_cashback_rate,0),2);
  new.shipping_cost:=0;
  new.shipping_method:=null;
  new.coupon_code:=null;
  new.discount_amount:=0;
  return new;
end;
$function$;