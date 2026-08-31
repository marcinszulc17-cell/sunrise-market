-- Synchronize production booking enforcement logic with repository migrations.
-- Mirrors live Supabase state as of 2026-08-31 after per-resource schedules,
-- any-available resource selection, multi-resource concurrency and reschedule lock alignment.

create or replace function market.booking_available_slots_v2(
  p_offer uuid,
  p_service uuid default null,
  p_resource uuid default null,
  p_from timestamptz default now(),
  p_to timestamptz default (now() + interval '30 days')
)
returns table(starts_at timestamptz, ends_at timestamptz, amount_gross numeric, service_id uuid, resource_id uuid)
language plpgsql
stable security definer
set search_path to 'market','public'
as $function$
declare
  v_config market.booking_offers%rowtype;
  v_duration integer;
  v_price numeric;
  v_before integer := 0;
  v_after integer := 0;
  v_has_resource_schedule boolean := false;
begin
  select * into v_config from market.booking_offers where offer_id=p_offer and active;
  if v_config.offer_id is null or v_config.booking_type<>'appointment' then return; end if;
  if p_to<=p_from or p_to>p_from+interval '62 days' then raise exception 'Zakres kalendarza może obejmować maksymalnie 62 dni'; end if;

  if p_service is not null then
    select duration_minutes,price_gross,buffer_before_minutes,buffer_after_minutes
      into v_duration,v_price,v_before,v_after
    from market.booking_services
    where id=p_service and offer_id=p_offer and active;
    if v_duration is null then raise exception 'Wybrana usługa jest niedostępna'; end if;
  else
    v_duration:=v_config.duration_minutes;
    select coalesce(v_config.price_per_unit,o.price_gross) into v_price from market.offers o where o.id=p_offer;
  end if;

  if p_resource is null and exists(
    select 1
    from market.booking_offer_resources x
    join market.booking_resources r on r.id=x.resource_id and r.active
    where x.offer_id=p_offer
      and (
        p_service is null
        or not exists(select 1 from market.booking_service_resources sr0 where sr0.service_id=p_service)
        or exists(select 1 from market.booking_service_resources sr where sr.service_id=p_service and sr.resource_id=r.id)
      )
  ) then
    return query
    select distinct on (s.starts_at)
      s.starts_at,s.ends_at,s.amount_gross,s.service_id,s.resource_id
    from market.booking_offer_resources x
    join market.booking_resources r on r.id=x.resource_id and r.active
    cross join lateral market.booking_available_slots_v2(p_offer,p_service,r.id,p_from,p_to) s
    where x.offer_id=p_offer
      and (
        p_service is null
        or not exists(select 1 from market.booking_service_resources sr0 where sr0.service_id=p_service)
        or exists(select 1 from market.booking_service_resources sr where sr.service_id=p_service and sr.resource_id=r.id)
      )
    order by s.starts_at,r.name,r.id;
    return;
  end if;

  if p_resource is not null and not exists(
    select 1 from market.booking_offer_resources x
    join market.booking_resources r on r.id=x.resource_id and r.active
    where x.offer_id=p_offer and x.resource_id=p_resource
  ) then raise exception 'Wybrany zasób jest niedostępny'; end if;

  if p_service is not null and p_resource is not null
     and exists(select 1 from market.booking_service_resources where service_id=p_service)
     and not exists(select 1 from market.booking_service_resources where service_id=p_service and resource_id=p_resource)
  then raise exception 'Ten pracownik/zasób nie wykonuje wybranej usługi'; end if;

  if p_resource is not null then
    select exists(select 1 from market.booking_resource_availability a where a.resource_id=p_resource)
      into v_has_resource_schedule;
  end if;

  return query
  with local_days as (
    select d::date local_day
    from generate_series((p_from at time zone v_config.timezone)::date,(p_to at time zone v_config.timezone)::date,interval '1 day') d
  ), avail as (
    select a.weekday,a.starts_at,a.ends_at
    from market.booking_resource_availability a
    where v_has_resource_schedule and a.resource_id=p_resource
    union all
    select a.weekday,a.starts_at,a.ends_at
    from market.booking_availability a
    where not v_has_resource_schedule and a.offer_id=p_offer
  ), candidates as (
    select gs slot_start,gs+make_interval(mins=>v_duration) slot_end
    from local_days d
    join avail a on a.weekday=extract(dow from d.local_day)::integer
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
      select 1 from market.booking_resource_time_off t
      where p_resource is not null and t.resource_id=p_resource
        and tstzrange(t.starts_at,t.ends_at,'[)')&&tstzrange(c.slot_start,c.slot_end,'[)')
    )
    and not exists(
      select 1 from market.bookings x
      where (
        (p_resource is null and x.offer_id=p_offer)
        or (p_resource is not null and (x.resource_id=p_resource or (x.offer_id=p_offer and x.resource_id is null)))
      )
        and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
        and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)')&&tstzrange(c.slot_start,c.slot_end,'[)')
    )
    and not exists(
      select 1 from market.booking_blocks z
      where z.offer_id=p_offer
        and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(c.slot_start,c.slot_end,'[)')
    )
  order by c.slot_start;
end;$function$;

create or replace function market.create_booking_hold_v2(
  p_offer uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_service uuid default null,
  p_resource uuid default null
)
returns table(booking_id uuid, starts_at timestamptz, ends_at timestamptz, base_amount_gross numeric, fees_gross numeric, deposit_gross numeric, amount_gross numeric, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'market','public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_config market.booking_offers%rowtype;
  v_offer market.offers%rowtype;
  v_start timestamptz; v_end timestamptz;
  v_units integer; v_base numeric:=0; v_fees numeric:=0; v_deposit numeric:=0; v_total numeric:=0;
  v_duration integer; v_price numeric; v_before integer:=0; v_after integer:=0;
  v_id uuid; v_expiry timestamptz:=now()+interval '15 minutes'; v_day date; v_min_units integer;
begin
  if v_uid is null then raise exception 'Zaloguj się, aby zarezerwować'; end if;
  select * into v_config from market.booking_offers where offer_id=p_offer and active;
  select o.* into v_offer from market.offers o join market.sellers s on s.id=o.seller_id and s.status='active' where o.id=p_offer and o.status='active';
  if v_config.offer_id is null or v_offer.id is null then raise exception 'Rezerwacja tej oferty jest niedostępna'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_offer::text||coalesce(p_resource::text,''),0));

  if p_resource is not null and not exists(
    select 1 from market.booking_offer_resources x
    join market.booking_resources r on r.id=x.resource_id and r.active
    where x.offer_id=p_offer and x.resource_id=p_resource
  ) then raise exception 'Wybrany zasób jest niedostępny'; end if;

  if v_config.booking_type='appointment' then
    if p_service is not null then
      select duration_minutes,price_gross,buffer_before_minutes,buffer_after_minutes into v_duration,v_price,v_before,v_after
      from market.booking_services where id=p_service and offer_id=p_offer and active;
      if v_duration is null then raise exception 'Wybrana usługa jest niedostępna'; end if;
    else
      v_duration:=v_config.duration_minutes; v_price:=coalesce(v_config.price_per_unit,v_offer.price_gross);
    end if;
    if p_service is not null and p_resource is not null and exists(select 1 from market.booking_service_resources where service_id=p_service)
       and not exists(select 1 from market.booking_service_resources where service_id=p_service and resource_id=p_resource) then raise exception 'Ten zasób nie obsługuje wybranej usługi'; end if;
    v_start:=p_starts_at; v_end:=p_starts_at+make_interval(mins=>v_duration); v_units:=1; v_base:=round(v_price,2);
    if not exists(select 1 from market.booking_available_slots_v2(p_offer,p_service,p_resource,v_start-interval '1 second',v_end+interval '1 second') s where s.starts_at=v_start) then raise exception 'Wybrany termin nie jest już dostępny'; end if;
  else
    v_start:=(((p_starts_at at time zone v_config.timezone)::date)::timestamp at time zone v_config.timezone);
    if p_ends_at is null then raise exception 'Wybierz datę zakończenia'; end if;
    v_end:=(((p_ends_at at time zone v_config.timezone)::date)::timestamp at time zone v_config.timezone);
    v_units:=((v_end at time zone v_config.timezone)::date-(v_start at time zone v_config.timezone)::date);
    if v_units<1 then raise exception 'Rezerwacja musi trwać co najmniej jeden dzień'; end if;
    v_min_units:=v_config.min_units;
    select greatest(v_min_units,coalesce(max(rr.min_units),v_min_units)) into v_min_units from market.booking_rate_rules rr
      where rr.offer_id=p_offer and rr.active and daterange(rr.starts_on,rr.ends_on,'[]') && daterange((v_start at time zone v_config.timezone)::date,((v_end at time zone v_config.timezone)::date-1),'[]');
    if v_units<v_min_units then raise exception 'Minimalny okres rezerwacji to % dni',v_min_units; end if;
    if v_units>v_config.max_units then raise exception 'Maksymalny okres rezerwacji to % dni',v_config.max_units; end if;
    if p_resource is not null and exists(select 1 from market.booking_resource_time_off t where t.resource_id=p_resource and tstzrange(t.starts_at,t.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Wybrany zasób jest niedostępny w tym okresie'; end if;
    v_day:=(v_start at time zone v_config.timezone)::date;
    while v_day<(v_end at time zone v_config.timezone)::date loop
      v_base:=v_base+coalesce(market.booking_price_for_day(p_offer,v_day),0);
      v_day:=v_day+1;
    end loop;
    v_fees:=coalesce(v_config.cleaning_fee_gross,0); v_deposit:=coalesce(v_config.deposit_gross,0);
    if exists(select 1 from market.bookings x where ((p_resource is null and x.offer_id=p_offer) or (p_resource is not null and (x.resource_id=p_resource or (x.offer_id=p_offer and x.resource_id is null)))) and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now())) and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Wybrany okres jest zajęty'; end if;
    if exists(select 1 from market.booking_blocks z where z.offer_id=p_offer and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Wybrany okres jest niedostępny'; end if;
  end if;
  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Ten termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nie można rezerwować z tak dużym wyprzedzeniem'; end if;

  update market.bookings set status='expired',updated_at=now() where status in('held','pending_payment') and hold_expires_at<=now();
  update market.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where offer_id=p_offer and buyer_id=v_uid and status='held';
  v_total:=round(v_base+v_fees,2);
  insert into market.bookings(offer_id,seller_id,buyer_id,booking_type,starts_at,ends_at,units,unit_price_gross,base_amount_gross,fees_gross,deposit_gross,amount_gross,status,hold_expires_at,service_id,resource_id)
  values(p_offer,v_offer.seller_id,v_uid,v_config.booking_type,v_start,v_end,v_units,round(case when v_units>0 then v_base/v_units else v_base end,2),round(v_base,2),round(v_fees,2),round(v_deposit,2),v_total,'held',v_expiry,p_service,p_resource)
  returning id into v_id;
  return query select v_id,v_start,v_end,round(v_base,2),round(v_fees,2),round(v_deposit,2),v_total,v_expiry;
end;$function$;

create or replace function market.seller_booking_move(p_booking uuid, p_starts_at timestamptz, p_resource uuid)
returns table(starts_at timestamptz, ends_at timestamptz, resource_id uuid, resource_name text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid(); v_booking market.bookings%rowtype; v_config market.booking_offers%rowtype;
  v_start timestamptz; v_end timestamptz; v_duration interval; v_before integer := 0; v_after integer := 0;
  v_old_lock bigint; v_new_lock bigint; v_resource_name text; v_title text;
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
  select r.name into v_resource_name from market.booking_offer_resources x join market.booking_resources r on r.id=x.resource_id where x.offer_id=v_booking.offer_id and x.resource_id=p_resource and r.active and r.seller_id=v_booking.seller_id;
  if v_resource_name is null then raise exception 'Wybrany zasób nie jest dostępny dla tej oferty'; end if;
  if v_booking.service_id is not null and exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id) and not exists(select 1 from market.booking_service_resources sr where sr.service_id=v_booking.service_id and sr.resource_id=p_resource) then raise exception 'Ten pracownik/zasób nie wykonuje wybranej usługi'; end if;
  v_old_lock:=pg_catalog.hashtextextended(v_booking.offer_id::text||coalesce(v_booking.resource_id::text,''),0);
  v_new_lock:=pg_catalog.hashtextextended(v_booking.offer_id::text||p_resource::text,0);
  perform pg_advisory_xact_lock(least(v_old_lock,v_new_lock)); if v_old_lock<>v_new_lock then perform pg_advisory_xact_lock(greatest(v_old_lock,v_new_lock)); end if;
  v_duration:=v_booking.ends_at-v_booking.starts_at; v_start:=p_starts_at; v_end:=v_start+v_duration;
  if v_booking.service_id is not null then select s.buffer_before_minutes,s.buffer_after_minutes into v_before,v_after from market.booking_services s where s.id=v_booking.service_id and s.offer_id=v_booking.offer_id and s.active; if not found then raise exception 'Usługa przypisana do rezerwacji nie jest już aktywna'; end if; end if;
  if not market.booking_resource_time_allowed(v_booking.offer_id,p_resource,v_start,v_end) then raise exception 'Nowy termin wypada poza grafikiem lub w czasie nieobecności zasobu'; end if;
  if mod(extract(minute from (v_start at time zone v_config.timezone))::integer,v_config.slot_interval_minutes)<>0 and v_config.slot_interval_minutes<60 then raise exception 'Nowy termin nie pasuje do interwału kalendarza'; end if;
  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Nowy termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nowy termin jest zbyt odległy'; end if;
  if exists(select 1 from market.bookings x where x.id<>v_booking.id and (x.resource_id=p_resource or (x.offer_id=v_booking.offer_id and x.resource_id is null)) and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now())) and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Wybrany zasób jest zajęty w tym terminie'; end if;
  if exists(select 1 from market.booking_blocks z where z.offer_id=v_booking.offer_id and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Nowy termin jest zablokowany przez sprzedawcę'; end if;
  update market.bookings set starts_at=v_start,ends_at=v_end,resource_id=p_resource,updated_at=now() where id=v_booking.id;
  select o.title into v_title from market.offers o where o.id=v_booking.offer_id;
  insert into market.notifications(user_id,channel,type,title,body) values(v_booking.buyer_id,'app','booking_rescheduled','Termin rezerwacji został zmieniony',coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY HH24:MI')||', zasób: '||v_resource_name||'.');
  return query select v_start,v_end,p_resource,v_resource_name;
end;$function$;

create or replace function market.seller_booking_reschedule(p_booking uuid, p_starts_at timestamptz)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_booking market.bookings%rowtype; v_config market.booking_offers%rowtype; v_title text;
  v_start timestamptz; v_end timestamptz; v_duration interval; v_before integer:=0; v_after integer:=0;
  v_local_start timestamp; v_local_end timestamp;
begin
  if v_uid is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null then raise exception 'Wybierz rezerwację i nowy termin'; end if;
  select b.* into v_booking from market.bookings b where b.id=p_booking for update;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.status<>'confirmed' then raise exception 'Termin można zmienić tylko dla potwierdzonej rezerwacji'; end if;
  select bo.* into v_config from market.booking_offers bo where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu dla tej oferty'; end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_booking.offer_id::text||coalesce(v_booking.resource_id::text,''),0));
  if v_booking.booking_type='appointment' then
    v_duration:=v_booking.ends_at-v_booking.starts_at; v_start:=p_starts_at; v_end:=v_start+v_duration;
    if v_booking.service_id is not null then select s.buffer_before_minutes,s.buffer_after_minutes into v_before,v_after from market.booking_services s where s.id=v_booking.service_id and s.offer_id=v_booking.offer_id and s.active; if not found then raise exception 'Usługa przypisana do rezerwacji nie jest już aktywna'; end if; end if;
    if v_booking.resource_id is not null and not exists(select 1 from market.booking_offer_resources x join market.booking_resources r on r.id=x.resource_id and r.active where x.offer_id=v_booking.offer_id and x.resource_id=v_booking.resource_id) then raise exception 'Zasób przypisany do rezerwacji nie jest już dostępny'; end if;
    if not market.booking_resource_time_allowed(v_booking.offer_id,v_booking.resource_id,v_start,v_end) then raise exception 'Nowy termin wypada poza grafikiem lub w czasie nieobecności zasobu'; end if;
  elsif v_booking.booking_type='daily' then
    v_local_start:=(p_starts_at at time zone v_config.timezone)::date::timestamp; v_local_end:=v_local_start+make_interval(days=>v_booking.units); v_start:=v_local_start at time zone v_config.timezone; v_end:=v_local_end at time zone v_config.timezone;
    if v_booking.resource_id is not null and exists(select 1 from market.booking_resource_time_off t where t.resource_id=v_booking.resource_id and tstzrange(t.starts_at,t.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Zasób jest niedostępny w wybranym okresie'; end if;
  else raise exception 'Nieobsługiwany typ rezerwacji'; end if;
  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Nowy termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nowy termin jest zbyt odległy'; end if;
  if v_end<=v_start then raise exception 'Nieprawidłowy zakres rezerwacji'; end if;
  if exists(select 1 from market.bookings x where x.id<>v_booking.id and ((v_booking.resource_id is null and x.offer_id=v_booking.offer_id) or (v_booking.resource_id is not null and (x.resource_id=v_booking.resource_id or (x.offer_id=v_booking.offer_id and x.resource_id is null)))) and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now())) and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Nowy termin koliduje z inną rezerwacją'; end if;
  if exists(select 1 from market.booking_blocks z where z.offer_id=v_booking.offer_id and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Nowy termin jest zablokowany przez sprzedawcę'; end if;
  update market.bookings set starts_at=v_start,ends_at=v_end,updated_at=now() where id=v_booking.id;
  select o.title into v_title from market.offers o where o.id=v_booking.offer_id;
  insert into market.notifications(user_id,channel,type,title,body) values(v_booking.buyer_id,'app','booking_rescheduled','Termin rezerwacji został zmieniony',case when v_booking.booking_type='daily' then coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY')||' – '||to_char(v_end at time zone v_config.timezone,'DD.MM.YYYY')||'.' else coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY HH24:MI')||'.' end);
  return query select v_start,v_end;
end;$function$;

-- Match production execute privileges.
revoke execute on function market.booking_resource_time_allowed(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke execute on function market.seller_booking_move(uuid,timestamptz,uuid) from public,anon,authenticated;
revoke execute on function market.seller_booking_reschedule(uuid,timestamptz) from public,anon,authenticated;
grant execute on function market.seller_booking_move(uuid,timestamptz,uuid) to authenticated;
grant execute on function market.seller_booking_reschedule(uuid,timestamptz) to authenticated;
