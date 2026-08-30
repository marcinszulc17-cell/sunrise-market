-- Per-resource weekly schedules and one-off time off.
-- Applied to production Supabase on 2026-08-31.

create table if not exists market.booking_resource_availability (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references market.booking_resources(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists booking_resource_availability_resource_weekday_idx on market.booking_resource_availability(resource_id,weekday);

create table if not exists market.booking_resource_time_off (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references market.booking_resources(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists booking_resource_time_off_resource_period_idx on market.booking_resource_time_off(resource_id,starts_at,ends_at);

alter table market.booking_resource_availability enable row level security;
alter table market.booking_resource_time_off enable row level security;
revoke all on market.booking_resource_availability from anon,authenticated;
revoke all on market.booking_resource_time_off from anon,authenticated;

create or replace function market.seller_booking_resource_schedule(p_resource uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_seller uuid:=market.current_seller_id(); v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null and not market.is_operator() then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.booking_resources r where r.id=p_resource and (r.seller_id=v_seller or market.is_operator())) then raise exception 'Brak dostępu do zasobu'; end if;
  select jsonb_build_object(
    'windows',coalesce((select jsonb_agg(jsonb_build_object('weekday',a.weekday,'starts_at',to_char(a.starts_at,'HH24:MI'),'ends_at',to_char(a.ends_at,'HH24:MI')) order by a.weekday,a.starts_at) from market.booking_resource_availability a where a.resource_id=p_resource),'[]'::jsonb),
    'time_off',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'starts_at',t.starts_at,'ends_at',t.ends_at,'reason',t.reason) order by t.starts_at desc) from market.booking_resource_time_off t where t.resource_id=p_resource and t.ends_at>now()-interval '30 days'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;$function$;

create or replace function market.seller_booking_resource_schedule_replace(p_resource uuid,p_windows jsonb)
returns void language plpgsql security definer set search_path='' as $function$
declare v_seller uuid:=market.current_seller_id(); v_item jsonb; v_weekday smallint; v_start time; v_end time;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if not exists(select 1 from market.booking_resources r where r.id=p_resource and (r.seller_id=v_seller or market.is_operator())) then raise exception 'Brak dostępu do zasobu'; end if;
  if p_windows is null or jsonb_typeof(p_windows)<>'array' then raise exception 'Nieprawidłowy grafik'; end if;
  delete from market.booking_resource_availability where resource_id=p_resource;
  for v_item in select value from jsonb_array_elements(p_windows) loop
    v_weekday:=(v_item->>'weekday')::smallint; v_start:=(v_item->>'starts_at')::time; v_end:=(v_item->>'ends_at')::time;
    if v_weekday not between 0 and 6 or v_end<=v_start then raise exception 'Nieprawidłowe godziny grafiku'; end if;
    insert into market.booking_resource_availability(resource_id,weekday,starts_at,ends_at) values(p_resource,v_weekday,v_start,v_end);
  end loop;
end;$function$;

create or replace function market.seller_booking_resource_time_off_add(p_resource uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_seller uuid:=market.current_seller_id(); v_id uuid;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Nieprawidłowy zakres nieobecności'; end if;
  if not exists(select 1 from market.booking_resources r where r.id=p_resource and (r.seller_id=v_seller or market.is_operator())) then raise exception 'Brak dostępu do zasobu'; end if;
  insert into market.booking_resource_time_off(resource_id,starts_at,ends_at,reason) values(p_resource,p_starts_at,p_ends_at,nullif(trim(p_reason),'')) returning id into v_id;
  return v_id;
end;$function$;

create or replace function market.seller_booking_resource_time_off_delete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_seller uuid:=market.current_seller_id();
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  delete from market.booking_resource_time_off t using market.booking_resources r where t.id=p_id and r.id=t.resource_id and (r.seller_id=v_seller or market.is_operator());
  if not found then raise exception 'Nie znaleziono nieobecności'; end if;
end;$function$;

revoke execute on function market.seller_booking_resource_schedule(uuid) from public,anon,authenticated;
revoke execute on function market.seller_booking_resource_schedule_replace(uuid,jsonb) from public,anon,authenticated;
revoke execute on function market.seller_booking_resource_time_off_add(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke execute on function market.seller_booking_resource_time_off_delete(uuid) from public,anon,authenticated;
grant execute on function market.seller_booking_resource_schedule(uuid) to authenticated;
grant execute on function market.seller_booking_resource_schedule_replace(uuid,jsonb) to authenticated;
grant execute on function market.seller_booking_resource_time_off_add(uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function market.seller_booking_resource_time_off_delete(uuid) to authenticated;

create or replace function market.booking_resource_time_allowed(p_offer uuid,p_resource uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare v_tz text; v_interval integer; v_has_schedule boolean; v_allowed boolean;
begin
  if p_offer is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then return false; end if;
  select bo.timezone,bo.slot_interval_minutes into v_tz,v_interval from market.booking_offers bo where bo.offer_id=p_offer;
  if v_tz is null or v_interval is null or v_interval<=0 then return false; end if;
  if p_resource is null then
    return exists(select 1 from market.booking_availability a where a.offer_id=p_offer and a.weekday=extract(dow from (p_starts_at at time zone v_tz))::integer and (p_starts_at at time zone v_tz)::date=(p_ends_at at time zone v_tz)::date and (p_starts_at at time zone v_tz)::time>=a.starts_at and (p_ends_at at time zone v_tz)::time<=a.ends_at and mod(floor(extract(epoch from ((p_starts_at at time zone v_tz)::time-a.starts_at))/60)::integer,v_interval)=0);
  end if;
  select exists(select 1 from market.booking_resource_availability a where a.resource_id=p_resource) into v_has_schedule;
  if v_has_schedule then
    select exists(select 1 from market.booking_resource_availability a where a.resource_id=p_resource and a.weekday=extract(dow from (p_starts_at at time zone v_tz))::integer and (p_starts_at at time zone v_tz)::date=(p_ends_at at time zone v_tz)::date and (p_starts_at at time zone v_tz)::time>=a.starts_at and (p_ends_at at time zone v_tz)::time<=a.ends_at and mod(floor(extract(epoch from ((p_starts_at at time zone v_tz)::time-a.starts_at))/60)::integer,v_interval)=0) into v_allowed;
  else
    select exists(select 1 from market.booking_availability a where a.offer_id=p_offer and a.weekday=extract(dow from (p_starts_at at time zone v_tz))::integer and (p_starts_at at time zone v_tz)::date=(p_ends_at at time zone v_tz)::date and (p_starts_at at time zone v_tz)::time>=a.starts_at and (p_ends_at at time zone v_tz)::time<=a.ends_at and mod(floor(extract(epoch from ((p_starts_at at time zone v_tz)::time-a.starts_at))/60)::integer,v_interval)=0) into v_allowed;
  end if;
  if not v_allowed then return false; end if;
  if exists(select 1 from market.booking_resource_time_off t where t.resource_id=p_resource and tstzrange(t.starts_at,t.ends_at,'[)')&&tstzrange(p_starts_at,p_ends_at,'[)')) then return false; end if;
  return true;
end;$function$;
revoke execute on function market.booking_resource_time_allowed(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;

-- Existing public slot/hold and seller move/reschedule RPCs are replaced in production
-- to call the schedule rules above. Keep their bodies synchronized with live DB via
-- subsequent migrations if those RPCs change further.
