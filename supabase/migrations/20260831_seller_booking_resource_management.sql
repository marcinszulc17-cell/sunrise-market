create or replace function market.seller_booking_resources_manage()
returns table(id uuid, name text, kind text, description text, active boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select r.id, r.name, r.kind, r.description, r.active
  from market.booking_resources r
  where r.seller_id = market.current_seller_id()
     or market.is_operator()
  order by r.active desc,
    case r.kind
      when 'staff' then 1
      when 'vehicle' then 2
      when 'property' then 3
      when 'room' then 4
      when 'equipment' then 5
      else 9
    end,
    r.name;
$$;

create or replace function market.seller_booking_resource_update(
  p_id uuid,
  p_name text,
  p_kind text,
  p_description text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_seller uuid := market.current_seller_id();
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_id is null then raise exception 'Wybierz zasób'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Nazwa zasobu jest wymagana'; end if;
  if p_kind not in ('staff','vehicle','property','room','equipment','other') then raise exception 'Nieprawidłowy typ zasobu'; end if;

  update market.booking_resources r
  set name=trim(p_name),
      kind=p_kind,
      description=nullif(trim(coalesce(p_description,'')),''),
      active=coalesce(p_active,true),
      updated_at=now()
  where r.id=p_id
    and (r.seller_id=v_seller or market.is_operator());

  if not found then raise exception 'Nie znaleziono zasobu'; end if;
end;
$$;

revoke all on function market.seller_booking_resources_manage() from public;
revoke execute on function market.seller_booking_resources_manage() from anon;
grant execute on function market.seller_booking_resources_manage() to authenticated;

revoke all on function market.seller_booking_resource_update(uuid,text,text,text,boolean) from public;
revoke execute on function market.seller_booking_resource_update(uuid,text,text,text,boolean) from anon;
grant execute on function market.seller_booking_resource_update(uuid,text,text,text,boolean) to authenticated;
