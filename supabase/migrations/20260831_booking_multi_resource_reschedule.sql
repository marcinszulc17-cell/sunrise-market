create or replace function market.seller_booking_reschedule(p_booking uuid, p_starts_at timestamptz)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking market.bookings%rowtype;
  v_config market.booking_offers%rowtype;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_duration interval;
  v_before integer := 0;
  v_after integer := 0;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if v_uid is null then raise exception 'Brak autoryzacji'; end if;
  if p_booking is null or p_starts_at is null then raise exception 'Wybierz rezerwację i nowy termin'; end if;

  select b.* into v_booking from market.bookings b where b.id=p_booking for update;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if v_booking.status<>'confirmed' then raise exception 'Termin można zmienić tylko dla potwierdzonej rezerwacji'; end if;

  select bo.* into v_config from market.booking_offers bo where bo.offer_id=v_booking.offer_id;
  if v_config.offer_id is null then raise exception 'Brak konfiguracji bookingu dla tej oferty'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_config.timezone) then raise exception 'Nieprawidłowa strefa czasowa oferty'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_booking.offer_id::text,0));
  if v_booking.resource_id is not null then
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended('resource:'||v_booking.resource_id::text,0));
  end if;

  if v_booking.booking_type='appointment' then
    v_duration:=v_booking.ends_at-v_booking.starts_at;
    v_start:=p_starts_at;
    v_end:=v_start+v_duration;

    if v_booking.service_id is not null then
      select s.buffer_before_minutes,s.buffer_after_minutes into v_before,v_after
      from market.booking_services s
      where s.id=v_booking.service_id and s.offer_id=v_booking.offer_id and s.active;
      if not found then raise exception 'Usługa przypisana do rezerwacji nie jest już aktywna'; end if;
    end if;

    if v_booking.resource_id is not null and not exists(
      select 1 from market.booking_offer_resources r
      join market.booking_resources br on br.id=r.resource_id and br.active
      where r.offer_id=v_booking.offer_id and r.resource_id=v_booking.resource_id
    ) then raise exception 'Zasób przypisany do rezerwacji nie jest już dostępny'; end if;

    if not exists(
      select 1 from market.booking_availability a
      where a.offer_id=v_booking.offer_id
        and a.weekday=extract(dow from (v_start at time zone v_config.timezone))::integer
        and (v_start at time zone v_config.timezone)::date=(v_end at time zone v_config.timezone)::date
        and (v_start at time zone v_config.timezone)::time>=a.starts_at
        and (v_end at time zone v_config.timezone)::time<=a.ends_at
        and mod(floor(extract(epoch from ((v_start at time zone v_config.timezone)::time-a.starts_at))/60)::integer,v_config.slot_interval_minutes)=0
    ) then raise exception 'Nowy termin nie mieści się w dostępności oferty'; end if;
  elsif v_booking.booking_type='daily' then
    v_local_start:=(p_starts_at at time zone v_config.timezone)::date::timestamp;
    v_local_end:=v_local_start+make_interval(days=>v_booking.units);
    v_start:=v_local_start at time zone v_config.timezone;
    v_end:=v_local_end at time zone v_config.timezone;
  else
    raise exception 'Nieobsługiwany typ rezerwacji';
  end if;

  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Nowy termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nowy termin jest zbyt odległy'; end if;
  if v_end<=v_start then raise exception 'Nieprawidłowy zakres rezerwacji'; end if;

  if exists(
    select 1 from market.bookings x
    where x.id<>v_booking.id
      and (
        (v_booking.resource_id is null and x.offer_id=v_booking.offer_id)
        or (v_booking.resource_id is not null and (x.resource_id=v_booking.resource_id or (x.offer_id=v_booking.offer_id and x.resource_id is null)))
      )
      and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
      and tstzrange(x.starts_at-make_interval(mins=>v_before),x.ends_at+make_interval(mins=>v_after),'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'Nowy termin koliduje z inną rezerwacją'; end if;

  if exists(select 1 from market.booking_blocks z where z.offer_id=v_booking.offer_id and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then
    raise exception 'Nowy termin jest zablokowany przez sprzedawcę';
  end if;

  update market.bookings set starts_at=v_start,ends_at=v_end,updated_at=now() where id=v_booking.id;
  select o.title into v_title from market.offers o where o.id=v_booking.offer_id;
  insert into market.notifications(user_id,channel,type,title,body)
  values(v_booking.buyer_id,'app','booking_rescheduled','Termin rezerwacji został zmieniony',case when v_booking.booking_type='daily' then coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY')||' – '||to_char(v_end at time zone v_config.timezone,'DD.MM.YYYY')||'.' else coalesce(v_title,'Rezerwacja')||': nowy termin '||to_char(v_start at time zone v_config.timezone,'DD.MM.YYYY HH24:MI')||'.' end);
  return query select v_start,v_end;
end;
$function$;
