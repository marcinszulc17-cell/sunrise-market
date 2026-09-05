-- Brakujące RPC wołane z /sprzedawca/rezerwacje/grafiki (status operacyjny zasobu: dostępny / serwis / awaria / blokada).
-- Status inny niż 'available' wyłącza zasób z nowych terminów (booking_resources.active = false).
alter table market.booking_resources add column if not exists operational_status text not null default 'available'
  check (operational_status in ('available','service','failure','blocked'));

create or replace function market.seller_booking_resource_operational_status(p_resource uuid, p_status text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_seller uuid := market.current_seller_id(); v_status text;
begin
  if not exists (select 1 from market.booking_resources r where r.id = p_resource and (r.seller_id = v_seller or market.is_operator())) then
    raise exception 'Brak dostępu do zasobu';
  end if;
  if p_status is not null then
    if p_status not in ('available','service','failure','blocked') then raise exception 'Nieprawidłowy status'; end if;
    update market.booking_resources set operational_status = p_status, active = (p_status = 'available'), updated_at = now() where id = p_resource;
  end if;
  select operational_status into v_status from market.booking_resources where id = p_resource;
  return coalesce(v_status, 'available');
end; $$;
revoke all on function market.seller_booking_resource_operational_status(uuid, text) from public;
grant execute on function market.seller_booking_resource_operational_status(uuid, text) to authenticated;
