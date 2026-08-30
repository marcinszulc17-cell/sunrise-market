create or replace function market.booking_available_slots_v2(p_offer uuid, p_service uuid default null::uuid, p_resource uuid default null::uuid, p_from timestamptz default now(), p_to timestamptz default (now() + interval '30 days'))
returns table(starts_at timestamptz, ends_at timestamptz, amount_gross numeric, service_id uuid, resource_id uuid)
language plpgsql
stable
security definer
set search_path to 'market', 'public'
as $function$
declare
  v_config market.booking_offers%rowtype;
  v_duration integer;
  v_price numeric;
  v_before integer := 0;
  v_after integer := 0;
begin
  select * into v_config from market.booking_offers where offer_id=p_offer and active;
  if v_config.offer_id is null or v_config.booking_type<>'appointment' then return; end if;
  if p_to<=p_from or p_to>p_from+interval '62 days' then raise exception 'Zakres kalendarza może obejmować maksymalnie 62 dni'; end if;

  if p_service is not null then
    select duration_minutes, price_gross, buffer_before_minutes, buffer_after_minutes
      into v_duration,v_price,v_before,v_after
    from market.booking_services
    where id=p_service and offer_id=p_offer and active;
    if v_duration is null then raise exception 'Wybrana usługa jest niedostępna'; end if;
  else
    v_duration:=v_config.duration_minutes;
    select coalesce(v_config.price_per_unit,o.price_gross) into v_price from market.offers o where o.id=p_offer;
  end if;

  if p_resource is not null and not exists(
    select 1 from market.booking_offer_resources x join market.booking_resources r on r.id=x.resource_id and r.active
    where x.offer_id=p_offer and x.resource_id=p_resource
  ) then raise exception 'Wybrany zasób jest niedostępny'; end if;
  if p_service is not null and p_resource is not null and exists(select 1 from market.booking_service_resources where service_id=p_service)
     and not exists(select 1 from market.booking_service_resources where service_id=p_service and resource_id=p_resource)
  then raise exception 'Ten pracownik/zasób nie wykonuje wybranej usługi'; end if;

  return query
  with local_days as(
    select d::date local_day from generate_series((p_from at time zone v_config.timezone)::date,(p_to at time zone v_config.timezone)::date,interval '1 day') d
  ), candidates as(
    select gs slot_start, gs+make_interval(mins=>v_duration) slot_end
    from local_days d
    join market.booking_availability a on a.offer_id=p_offer and a.weekday=extract(dow from d.local_day)::integer
    cross join lateral generate_series(
      (d.local_day+a.starts_at) at time zone v_config.timezone,
      ((d.local_day+a.ends_at) at time zone v_config.timezone)-make_interval(mins=>v_duration),
      make_interval(mins=>v_config.slot_interval_minutes)
    ) gs
  )
  select c.slot_start,c.slot_end,round(v_price,2),p_service,p_resource
  from candidates c
  where c.slot_start>=greatest(p_from,now()+make_interval(hours=>v_config.min_notice_hours))
    and c.slot_end<=p_to
    and c.slot_start<=now()+make_interval(days=>v_config.max_advance_days)
    and not exists(
      select 1 from market.bookings x
      where (
        (p_resource is null and x.offer_id=p_offer)
        or (p_resource is not null and (x.resource_id=p_resource or (x.offer_id=p_offer and x.resource_id is null)))
      )
        and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
        and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)') && tstzrange(c.slot_start,c.slot_end,'[)')
    )
    and not exists(
      select 1 from market.booking_blocks z where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(c.slot_start,c.slot_end,'[)')
    )
  order by c.slot_start;
end;$function$;

create or replace function market.seller_booking_move(p_booking uuid, p_starts_at timestamptz, p_resource uuid)
returns table(starts_at timestamptz, ends_at timestamptz, resource_id uuid, resource_name text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking market.bookings%rowtype;
  v_config market.booking_offers%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_duration interval;
  v_before integer := 0;
  v_after integer := 0;
  v_old_lock bigint;
  v_new_lock bigint;
  v_resource_name text;
  v_title text;
begin
  if v_uid is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null or p_resource is null then raise exception 'Wybierz rezerwację, termin i zasób'; end if;

  select b.* into v_booking from market.bookings b where b.id=p_booking for update;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.status<>'confirmed' then raise exception 'Przenosić można tylko potwierdzone rezerwacje'; end if;
  if v_booking.booking_type<>'appointment' then raise exception 'Między zasobami można przenosić tylko wizyty godzinowe'; end if;

  select bo.* into v_config from market.booking_offers bo where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu'; end if;

  select r.name into v_resource_name
  from market.booking_offer_resources x
  join market.booking_resources r on r.id=x.resource_id
  where x.offer_id=v_booking.offer_id and x.resource_id=p_resource and r.active and r.seller_id=v_booking.seller_id;
  if v_resource_name is null then raise exception 'Wybrany zasób nie jest dostępny dla tej oferty'; end if;

  if v_booking.service_id is not null
     and exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id)
     and not exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id and sr.resource_id=p_resource)
  then raise exception 'Ten pracownik/zasób nie wykonuje wybranej usługi'; end if;

  v_old_lock := pg_catalog.hashtextextended(v_booking.offer_id::text || coalesce(v_booking.resource_id::text,''),0);
  v_new_lock := pg_catalog.hashtextextended(v_booking.offer_id::text || p_resource::text,0);
  perform pg_advisory_xact_lock(least(v_old_lock,v_new_lock));
  if v_old_lock<>v_new_lock then perform pg_advisory_xact_lock(greatest(v_old_lock,v_new_lock)); end if;

  v_duration := v_booking.ends_at-v_booking.starts_at;
  v_start := p_starts_at;
  v_end := v_start+v_duration;

  if v_booking.service_id is not null then
    select s.buffer_before_minutes,s.buffer_after_minutes into v_before,v_after
    from market.booking_services s
    where s.id=v_booking.service_id and s.offer_id=v_booking.offer_id and s.active;
    if not found then raise exception 'Usługa przypisana do rezerwacji nie jest już aktywna'; end if;
  end if;

  if not exists(
    select 1 from market.booking_availability a
    where a.offer_id=v_booking.offer_id
      and a.weekday=extract(dow from (v_start at time zone v_config.timezone))::integer
      and (v_start at time zone v_config.timezone)::date=(v_end at time zone v_config.timezone)::date
      and (v_start at time zone v_config.timezone)::time>=a.starts_at
      and (v_end at time zone v_config.timezone)::time<=a.ends_at
      and mod(floor(extract(epoch from ((v_start at time zone v_config.timezone)::time-a.starts_at))/60)::integer,v_config.slot_interval_minutes)=0
  ) then raise exception 'Nowy termin nie mieści się w dostępności oferty'; end if;

  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Nowy termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nowy termin jest zbyt odległy'; end if;

  if exists(
    select 1 from market.bookings x
    where x.id<>v_booking.id
      and (x.resource_id=p_resource or (x.offer_id=v_booking.offer_id and x.resource_id is null))
      and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
      and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'Wybrany zasób jest zajęty w tym terminie'; end if;

  if exists(select 1 from market.booking_blocks z where z.offer_id=v_booking.offer_id and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Nowy termin jest zablokowany przez sprzedawcę'; end if;

  update market.bookings set starts_at=v_start,ends_at=v_end,resource_id=p_resource,updated_at=now() where id=v_booking.id;
  select o.title into v_title from market.offers o where o.id=v_booking.offer_id;
  insert into market.notifications(user_id,channel,type,title,body)
  values(v_booking.buyer_id,'app','booking_rescheduled','Termin rezerwacji został zmieniony',coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY HH24:MI')||', zasób: '||v_resource_name||'.');

  return query select v_start,v_end,p_resource,v_resource_name;
end;$function$;

revoke execute on function market.seller_booking_move(uuid,timestamptz,uuid) from public, anon, authenticated;
grant execute on function market.seller_booking_move(uuid,timestamptz,uuid) to authenticated;
