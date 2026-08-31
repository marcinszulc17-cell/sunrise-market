create or replace function market.seller_booking_resources_schedule_copy(p_source uuid, p_targets uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_source is null then raise exception 'Wybierz zasób źródłowy'; end if;
  if p_targets is null or cardinality(p_targets)=0 then raise exception 'Wybierz co najmniej jeden zasób docelowy'; end if;
  if cardinality(p_targets)>100 then raise exception 'Możesz zmienić maksymalnie 100 zasobów naraz'; end if;

  if not exists(
    select 1 from market.booking_resources r
    where r.id=p_source and (r.seller_id=v_seller or market.is_operator())
  ) then raise exception 'Brak dostępu do zasobu źródłowego'; end if;

  select array_agg(distinct x) into v_ids
  from unnest(p_targets) x
  where x is not null;
  if v_ids is null or cardinality(v_ids)=0 then raise exception 'Wybierz co najmniej jeden zasób docelowy'; end if;

  if exists(
    select 1 from unnest(v_ids) x
    left join market.booking_resources r on r.id=x
    where r.id is null or not (r.seller_id=v_seller or market.is_operator())
  ) then raise exception 'Brak dostępu do jednego lub więcej zasobów docelowych'; end if;

  delete from market.booking_resource_availability a
  where a.resource_id=any(v_ids);

  insert into market.booking_resource_availability(resource_id,weekday,starts_at,ends_at)
  select target.id,a.weekday,a.starts_at,a.ends_at
  from unnest(v_ids) target(id)
  join market.booking_resource_availability a on a.resource_id=p_source
  where target.id<>p_source;

  return cardinality(v_ids);
end;
$$;

revoke all on function market.seller_booking_resources_schedule_copy(uuid,uuid[]) from public;
revoke execute on function market.seller_booking_resources_schedule_copy(uuid,uuid[]) from anon;
grant execute on function market.seller_booking_resources_schedule_copy(uuid,uuid[]) to authenticated;
