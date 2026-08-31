create or replace function market.seller_booking_eligible_resources(p_booking uuid)
returns table(id uuid, name text, kind text, description text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null then raise exception 'Wybierz rezerwację'; end if;

  select b.* into v_booking
  from market.bookings b
  where b.id=p_booking;

  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.booking_type<>'appointment' then return; end if;

  return query
  select r.id,r.name,r.kind,r.description
  from market.booking_offer_resources bor
  join market.booking_resources r on r.id=bor.resource_id
  where bor.offer_id=v_booking.offer_id
    and r.active
    and r.seller_id=v_booking.seller_id
    and (
      v_booking.service_id is null
      or not exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id)
      or exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id and sr.resource_id=r.id)
    )
  order by case r.kind when 'staff' then 1 when 'vehicle' then 2 when 'property' then 3 when 'room' then 4 when 'equipment' then 5 else 9 end, r.name;
end;
$$;

revoke all on function market.seller_booking_eligible_resources(uuid) from public;
revoke execute on function market.seller_booking_eligible_resources(uuid) from anon;
grant execute on function market.seller_booking_eligible_resources(uuid) to authenticated;
