create or replace function market.normalize_booking_order_financials()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking market.bookings%rowtype;
  v_cashback_rate numeric := 0;
  v_cashback_raw text;
begin
  select b.* into v_booking
  from market.bookings b
  where b.order_id = new.id
  limit 1;

  if v_booking.id is null then
    return new;
  end if;

  begin
    select pc.value into v_cashback_raw
    from market.platform_config pc
    where pc.key = 'cashback_rate'
    limit 1;

    v_cashback_rate := coalesce(nullif(btrim(v_cashback_raw), ''), '0')::numeric;
  exception when others then
    v_cashback_rate := 0;
    raise warning 'normalize_booking_order_financials: invalid cashback_rate, using 0 for order %: %', new.id, sqlerrm;
  end;

  new.deposit_gross := round(coalesce(v_booking.deposit_gross, 0), 2);
  new.total_gross := round(coalesce(v_booking.amount_gross, 0) + coalesce(v_booking.deposit_gross, 0), 2);
  new.cashback_amount := round(coalesce(v_booking.amount_gross, 0) * coalesce(v_cashback_rate, 0), 2);
  new.shipping_cost := 0;
  new.shipping_method := null;
  new.coupon_code := null;
  new.discount_amount := 0;

  return new;
exception when others then
  raise warning 'normalize_booking_order_financials failed for order %, preserving incoming financial values: %', new.id, sqlerrm;
  return new;
end;
$function$;