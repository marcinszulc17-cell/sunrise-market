create or replace function market.seller_booking_resources_schedule_bulk()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null and not market.is_operator() then raise exception 'Brak konta sprzedawcy'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'kind', r.kind,
      'description', r.description,
      'active', r.active,
      'windows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'weekday', a.weekday,
          'starts_at', to_char(a.starts_at,'HH24:MI'),
          'ends_at', to_char(a.ends_at,'HH24:MI')
        ) order by a.weekday,a.starts_at)
        from market.booking_resource_availability a
        where a.resource_id=r.id
      ), '[]'::jsonb),
      'time_off', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'starts_at', t.starts_at,
          'ends_at', t.ends_at,
          'reason', t.reason
        ) order by t.starts_at desc)
        from market.booking_resource_time_off t
        where t.resource_id=r.id and t.ends_at>now()-interval '30 days'
      ), '[]'::jsonb)
    )
    order by case r.kind when 'staff' then 1 when 'vehicle' then 2 when 'property' then 3 when 'room' then 4 when 'equipment' then 5 else 9 end, r.name
  ), '[]'::jsonb)
  into v_result
  from market.booking_resources r
  where (r.seller_id=v_seller or market.is_operator()) and r.active=true;

  return v_result;
end;
$$;

revoke all on function market.seller_booking_resources_schedule_bulk() from public;
revoke execute on function market.seller_booking_resources_schedule_bulk() from anon;
grant execute on function market.seller_booking_resources_schedule_bulk() to authenticated;
