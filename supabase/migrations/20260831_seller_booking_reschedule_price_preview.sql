create or replace function market.seller_booking_reschedule_price_preview(p_booking uuid,p_starts_at timestamptz)
returns table(
  booking_id uuid,
  price_locked boolean,
  paid boolean,
  locked_base_amount_gross numeric,
  locked_fees_gross numeric,
  locked_deposit_gross numeric,
  locked_amount_gross numeric,
  reference_base_amount_gross numeric,
  reference_fees_gross numeric,
  reference_deposit_gross numeric,
  reference_amount_gross numeric,
  difference_gross numeric,
  policy text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
  v_config market.booking_offers%rowtype;
  v_offer_price numeric:=0;
  v_reference_base numeric:=0;
  v_reference_fees numeric:=0;
  v_reference_deposit numeric:=0;
  v_reference_amount numeric:=0;
  v_start_date date;
  v_day date;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null then raise exception 'Wybierz rezerwację i nowy termin'; end if;

  select b.* into v_booking
  from market.bookings b
  where b.id=p_booking;

  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.status<>'confirmed' then raise exception 'Podgląd zmiany ceny jest dostępny dla potwierdzonej rezerwacji'; end if;

  select bo.* into v_config
  from market.booking_offers bo
  where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu'; end if;

  if v_booking.booking_type='appointment' then
    if v_booking.service_id is not null then
      select s.price_gross into v_reference_base
      from market.booking_services s
      where s.id=v_booking.service_id and s.offer_id=v_booking.offer_id;
      v_reference_base:=coalesce(v_reference_base,v_booking.base_amount_gross,v_booking.amount_gross,0);
    else
      select o.price_gross into v_offer_price from market.offers o where o.id=v_booking.offer_id;
      v_reference_base:=coalesce(v_config.price_per_unit,v_offer_price,v_booking.base_amount_gross,v_booking.amount_gross,0);
    end if;
    v_reference_fees:=0;
    v_reference_deposit:=coalesce(v_booking.deposit_gross,0);
  elsif v_booking.booking_type='daily' then
    v_start_date:=(p_starts_at at time zone v_config.timezone)::date;
    v_day:=v_start_date;
    while v_day < v_start_date + greatest(v_booking.units,1) loop
      v_reference_base:=v_reference_base+coalesce(market.booking_price_for_day(v_booking.offer_id,v_day),0);
      v_day:=v_day+1;
    end loop;
    v_reference_fees:=coalesce(v_config.cleaning_fee_gross,0);
    v_reference_deposit:=coalesce(v_config.deposit_gross,0);
  else
    raise exception 'Nieobsługiwany typ rezerwacji';
  end if;

  v_reference_amount:=round(v_reference_base+v_reference_fees,2);

  return query select
    v_booking.id,
    true,
    v_booking.paid_at is not null,
    round(coalesce(v_booking.base_amount_gross,0),2),
    round(coalesce(v_booking.fees_gross,0),2),
    round(coalesce(v_booking.deposit_gross,0),2),
    round(coalesce(v_booking.amount_gross,0),2),
    round(v_reference_base,2),
    round(v_reference_fees,2),
    round(v_reference_deposit,2),
    v_reference_amount,
    round(v_reference_amount-coalesce(v_booking.amount_gross,0),2),
    'locked_at_booking'::text;
end;
$$;

revoke all on function market.seller_booking_reschedule_price_preview(uuid,timestamptz) from public;
revoke execute on function market.seller_booking_reschedule_price_preview(uuid,timestamptz) from anon;
grant execute on function market.seller_booking_reschedule_price_preview(uuid,timestamptz) to authenticated;
