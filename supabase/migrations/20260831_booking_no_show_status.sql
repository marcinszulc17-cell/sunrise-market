alter table market.bookings drop constraint if exists bookings_status_check;
alter table market.bookings add constraint bookings_status_check
  check (status in ('held','pending_payment','confirmed','cancelled','completed','expired','no_show'));

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

revoke all on function market.seller_booking_set_status(uuid,text) from public;
revoke execute on function market.seller_booking_set_status(uuid,text) from anon;
grant execute on function market.seller_booking_set_status(uuid,text) to authenticated;
