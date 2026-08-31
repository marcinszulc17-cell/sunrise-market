-- Operational status for concrete booking resources (vehicle/property/room/equipment/staff).
-- Uses the existing resource time-off engine so public availability, holds and checkout
-- automatically respect service/failure/manual blocks without a parallel calendar model.

create or replace function market.seller_booking_resource_operational_status(
  p_resource uuid,
  p_status text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_status text := lower(trim(coalesce(p_status,'')));
  v_current text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if not exists(
    select 1 from market.booking_resources r
    where r.id=p_resource and (r.seller_id=v_seller or market.is_operator())
  ) then raise exception 'Brak dostępu do zasobu'; end if;

  if v_status <> '' and v_status not in ('available','service','failure','blocked') then
    raise exception 'Nieprawidłowy status zasobu';
  end if;

  if v_status <> '' then
    delete from market.booking_resource_time_off t
    where t.resource_id=p_resource
      and coalesce(t.reason,'') like '[STATUS] %';

    if v_status <> 'available' then
      insert into market.booking_resource_time_off(resource_id,starts_at,ends_at,reason)
      values(
        p_resource,
        now(),
        timestamptz '2099-12-31 23:59:59+00',
        case v_status
          when 'service' then '[STATUS] Serwis'
          when 'failure' then '[STATUS] Awaria'
          else '[STATUS] Blokada'
        end
      );
    end if;
  end if;

  select case
    when coalesce(t.reason,'')='[STATUS] Serwis' then 'service'
    when coalesce(t.reason,'')='[STATUS] Awaria' then 'failure'
    when coalesce(t.reason,'')='[STATUS] Blokada' then 'blocked'
    else null
  end
  into v_current
  from market.booking_resource_time_off t
  where t.resource_id=p_resource
    and coalesce(t.reason,'') like '[STATUS] %'
    and t.ends_at > now()
  order by t.created_at desc
  limit 1;

  return coalesce(v_current,'available');
end;
$$;

revoke all on function market.seller_booking_resource_operational_status(uuid,text) from public;
revoke execute on function market.seller_booking_resource_operational_status(uuid,text) from anon;
grant execute on function market.seller_booking_resource_operational_status(uuid,text) to authenticated;
