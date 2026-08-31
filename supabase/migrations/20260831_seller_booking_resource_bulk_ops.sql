create or replace function market.seller_booking_resources_set_active(p_resources uuid[], p_active boolean)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid := market.current_seller_id();
  v_ids uuid[];
  v_count integer;
begin
  if v_uid is null then raise exception 'Brak autoryzacji'; end if;
  if p_resources is null or cardinality(p_resources)=0 then raise exception 'Wybierz co najmniej jeden zasób'; end if;
  if cardinality(p_resources)>100 then raise exception 'Możesz zmienić maksymalnie 100 zasobów naraz'; end if;

  select array_agg(distinct x) into v_ids from unnest(p_resources) x where x is not null;
  if v_ids is null or cardinality(v_ids)=0 then raise exception 'Wybierz co najmniej jeden zasób'; end if;

  if exists (
    select 1 from unnest(v_ids) x
    left join market.booking_resources r on r.id=x
    where r.id is null or not (r.seller_id=v_seller or market.is_operator())
  ) then raise exception 'Brak dostępu do jednego lub więcej zasobów'; end if;

  update market.booking_resources r
  set active=p_active, updated_at=now()
  where r.id=any(v_ids) and r.active is distinct from p_active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function market.seller_booking_resources_time_off_add(
  p_resources uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid := market.current_seller_id();
  v_ids uuid[];
  v_count integer;
begin
  if v_uid is null then raise exception 'Brak autoryzacji'; end if;
  if p_resources is null or cardinality(p_resources)=0 then raise exception 'Wybierz co najmniej jeden zasób'; end if;
  if cardinality(p_resources)>100 then raise exception 'Możesz zmienić maksymalnie 100 zasobów naraz'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Koniec niedostępności musi być później niż początek'; end if;

  select array_agg(distinct x) into v_ids from unnest(p_resources) x where x is not null;
  if v_ids is null or cardinality(v_ids)=0 then raise exception 'Wybierz co najmniej jeden zasób'; end if;

  if exists (
    select 1 from unnest(v_ids) x
    left join market.booking_resources r on r.id=x
    where r.id is null or not (r.seller_id=v_seller or market.is_operator())
  ) then raise exception 'Brak dostępu do jednego lub więcej zasobów'; end if;

  insert into market.booking_resource_time_off(resource_id,starts_at,ends_at,reason)
  select x,p_starts_at,p_ends_at,nullif(trim(coalesce(p_reason,'')),'')
  from unnest(v_ids) x;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function market.seller_booking_resources_set_active(uuid[],boolean) from public;
revoke execute on function market.seller_booking_resources_set_active(uuid[],boolean) from anon;
grant execute on function market.seller_booking_resources_set_active(uuid[],boolean) to authenticated;

revoke all on function market.seller_booking_resources_time_off_add(uuid[],timestamptz,timestamptz,text) from public;
revoke execute on function market.seller_booking_resources_time_off_add(uuid[],timestamptz,timestamptz,text) from anon;
grant execute on function market.seller_booking_resources_time_off_add(uuid[],timestamptz,timestamptz,text) to authenticated;
