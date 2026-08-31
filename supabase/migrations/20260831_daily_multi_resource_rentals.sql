create or replace function market.booking_daily_resource_available(
  p_offer uuid,
  p_resource uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_resource is not null
    and exists (
      select 1
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id
      where bor.offer_id=p_offer
        and bor.resource_id=p_resource
        and r.active
    )
    and not exists (
      select 1
      from market.booking_resource_time_off t
      where t.resource_id=p_resource
        and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(p_start,p_end,'[)')
    )
    and not exists (
      select 1
      from market.bookings b
      where b.offer_id=p_offer
        and (b.resource_id=p_resource or b.resource_id is null)
        and (
          b.status='confirmed'
          or (b.status in ('held','pending_payment') and b.hold_expires_at>now())
        )
        and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_start,p_end,'[)')
    );
$$;

revoke all on function market.booking_daily_resource_available(uuid,uuid,timestamptz,timestamptz) from public;
revoke execute on function market.booking_daily_resource_available(uuid,uuid,timestamptz,timestamptz) from anon, authenticated;

create or replace function market.booking_unavailable_days_v2(p_offer uuid, p_from date, p_to date)
returns table(day date, reason text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_timezone text;
  v_type text;
  v_has_resources boolean:=false;
begin
  if p_offer is null or p_from is null or p_to is null then
    raise exception 'Podaj ofertę i zakres dat';
  end if;
  if p_to < p_from then
    raise exception 'Nieprawidłowy zakres dat';
  end if;
  if p_to - p_from > 370 then
    raise exception 'Zakres dat jest zbyt duży';
  end if;

  select b.timezone, b.booking_type
    into v_timezone, v_type
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active;

  if v_timezone is null or v_type <> 'daily' then
    return;
  end if;

  select exists (
    select 1
    from market.booking_offer_resources bor
    join market.booking_resources r on r.id=bor.resource_id and r.active
    where bor.offer_id=p_offer
  ) into v_has_resources;

  return query
  with days as (
    select gs::date as day,
           (gs::date::timestamp at time zone v_timezone) as starts_at,
           ((gs::date + 1)::timestamp at time zone v_timezone) as ends_at
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  )
  select d.day,
         case
           when exists (
             select 1 from market.booking_blocks z
             where z.offer_id=p_offer
               and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
           ) then 'blocked'
           else 'booked'
         end as reason
  from days d
  where exists (
    select 1 from market.booking_blocks z
    where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
  )
  or (
    v_has_resources
    and not exists (
      select 1
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id and r.active
      where bor.offer_id=p_offer
        and market.booking_daily_resource_available(p_offer,r.id,d.starts_at,d.ends_at)
    )
  )
  or (
    not v_has_resources
    and exists (
      select 1 from market.bookings x
      where x.offer_id=p_offer
        and (
          x.status='confirmed'
          or (x.status in ('held','pending_payment') and x.hold_expires_at>now())
        )
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(d.starts_at,d.ends_at,'[)')
    )
  )
  order by d.day;
end;
$$;

create or replace function market.booking_daily_quote_v2(p_offer uuid, p_from date, p_to date)
returns table(days integer, base numeric)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_config market.booking_offers%rowtype;
  v_days integer;
  v_base numeric;
  v_min_units integer;
  v_start timestamptz;
  v_end timestamptz;
  v_has_resources boolean:=false;
begin
  if p_offer is null or p_from is null or p_to is null then
    raise exception 'Wybierz prawidłowy okres rezerwacji';
  end if;

  select b.* into v_config
  from market.booking_offers b
  join market.offers o on o.id=b.offer_id and o.status='active'
  join market.sellers s on s.id=b.seller_id and s.status='active'
  where b.offer_id=p_offer and b.active and b.booking_type='daily';

  if v_config.offer_id is null then
    raise exception 'Rezerwacja dobowa tej oferty jest niedostępna';
  end if;

  v_days := p_to - p_from;
  if v_days < 1 then raise exception 'Rezerwacja musi trwać co najmniej jeden dzień'; end if;
  if v_days > v_config.max_units then raise exception 'Wybrany okres jest zbyt długi'; end if;
  if v_days > 366 then raise exception 'Zakres wyceny może obejmować maksymalnie 366 dni'; end if;

  v_min_units:=greatest(1,coalesce(v_config.min_units,1));
  select greatest(v_min_units,coalesce(max(rr.min_units),v_min_units))
    into v_min_units
  from market.booking_rate_rules rr
  where rr.offer_id=p_offer
    and rr.active
    and daterange(rr.starts_on,rr.ends_on,'[]') && daterange(p_from,p_to-1,'[]');

  if v_days<v_min_units then
    raise exception 'Minimalny okres rezerwacji to % dni',v_min_units;
  end if;

  v_start:=(p_from::timestamp at time zone v_config.timezone);
  v_end:=(p_to::timestamp at time zone v_config.timezone);

  if exists (
    select 1 from market.booking_blocks z
    where z.offer_id=p_offer
      and tstzrange(z.starts_at,z.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
  ) then
    raise exception 'Wybrany okres jest niedostępny';
  end if;

  select exists (
    select 1
    from market.booking_offer_resources bor
    join market.booking_resources r on r.id=bor.resource_id and r.active
    where bor.offer_id=p_offer
  ) into v_has_resources;

  if v_has_resources then
    if not exists (
      select 1
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id and r.active
      where bor.offer_id=p_offer
        and market.booking_daily_resource_available(p_offer,r.id,v_start,v_end)
    ) then
      raise exception 'Brak jednego wolnego zasobu przez cały wybrany okres';
    end if;
  elsif exists (
    select 1 from market.bookings x
    where x.offer_id=p_offer
      and (
        x.status='confirmed'
        or (x.status in ('held','pending_payment') and x.hold_expires_at>now())
      )
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(v_start,v_end,'[)')
  ) then
    raise exception 'Wybrany okres jest zajęty';
  end if;

  select round(coalesce(sum(market.booking_price_for_day(p_offer,d::date)),0),2)
    into v_base
  from generate_series(p_from::timestamp,(p_to-1)::timestamp,interval '1 day') d;

  return query select v_days,v_base;
end;
$$;

create or replace function market.create_booking_hold_v2(
  p_offer uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_service uuid default null,
  p_resource uuid default null
)
returns table(
  booking_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  base_amount_gross numeric,
  fees_gross numeric,
  deposit_gross numeric,
  amount_gross numeric,
  hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_config market.booking_offers%rowtype;
  v_offer market.offers%rowtype;
  v_start timestamptz; v_end timestamptz;
  v_units integer; v_base numeric:=0; v_fees numeric:=0; v_deposit numeric:=0; v_total numeric:=0;
  v_duration integer; v_price numeric; v_before integer:=0; v_after integer:=0;
  v_id uuid; v_expiry timestamptz:=now()+interval '15 minutes'; v_day date; v_min_units integer;
  v_resource uuid:=p_resource;
  v_has_resources boolean:=false;
begin
  if v_uid is null then raise exception 'Zaloguj się, aby zarezerwować'; end if;
  select * into v_config from market.booking_offers where offer_id=p_offer and active;
  select o.* into v_offer from market.offers o join market.sellers s on s.id=o.seller_id and s.status='active' where o.id=p_offer and o.status='active';
  if v_config.offer_id is null or v_offer.id is null then raise exception 'Rezerwacja tej oferty jest niedostępna'; end if;

  if v_config.booking_type='daily' then
    perform pg_advisory_xact_lock(hashtextextended(p_offer::text||':daily',0));
  else
    perform pg_advisory_xact_lock(hashtextextended(p_offer::text||coalesce(v_resource::text,''),0));
  end if;

  if v_resource is not null and not exists(
    select 1 from market.booking_offer_resources x
    join market.booking_resources r on r.id=x.resource_id and r.active
    where x.offer_id=p_offer and x.resource_id=v_resource
  ) then raise exception 'Wybrany zasób jest niedostępny'; end if;

  if v_config.booking_type='appointment' then
    if p_service is not null then
      select duration_minutes,price_gross,buffer_before_minutes,buffer_after_minutes into v_duration,v_price,v_before,v_after
      from market.booking_services where id=p_service and offer_id=p_offer and active;
      if v_duration is null then raise exception 'Wybrana usługa jest niedostępna'; end if;
    else
      v_duration:=v_config.duration_minutes; v_price:=coalesce(v_config.price_per_unit,v_offer.price_gross);
    end if;
    if p_service is not null and v_resource is not null and exists(select 1 from market.booking_service_resources where service_id=p_service)
       and not exists(select 1 from market.booking_service_resources where service_id=p_service and resource_id=v_resource) then raise exception 'Ten zasób nie obsługuje wybranej usługi'; end if;
    v_start:=p_starts_at; v_end:=p_starts_at+make_interval(mins=>v_duration); v_units:=1; v_base:=round(v_price,2);
    if not exists(select 1 from market.booking_available_slots_v2(p_offer,p_service,v_resource,v_start-interval '1 second',v_end+interval '1 second') s where s.starts_at=v_start) then raise exception 'Wybrany termin nie jest już dostępny'; end if;
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

    if exists(select 1 from market.booking_blocks z where z.offer_id=p_offer and tstzrange(z.starts_at,z.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Wybrany okres jest niedostępny'; end if;

    select exists (
      select 1
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id and r.active
      where bor.offer_id=p_offer
    ) into v_has_resources;

    if v_resource is null and v_has_resources then
      select r.id into v_resource
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id and r.active
      where bor.offer_id=p_offer
        and market.booking_daily_resource_available(p_offer,r.id,v_start,v_end)
      order by r.name,r.id
      limit 1;
      if v_resource is null then raise exception 'Brak jednego wolnego zasobu przez cały wybrany okres'; end if;
    elsif v_resource is not null then
      if not market.booking_daily_resource_available(p_offer,v_resource,v_start,v_end) then
        raise exception 'Wybrany zasób jest niedostępny w tym okresie';
      end if;
    elsif exists(
      select 1 from market.bookings x
      where x.offer_id=p_offer
        and (x.status='confirmed' or (x.status in ('held','pending_payment') and x.hold_expires_at>now()))
        and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(v_start,v_end,'[)')
    ) then
      raise exception 'Wybrany okres jest zajęty';
    end if;

    v_day:=(v_start at time zone v_config.timezone)::date;
    while v_day<(v_end at time zone v_config.timezone)::date loop
      v_base:=v_base+coalesce(market.booking_price_for_day(p_offer,v_day),0);
      v_day:=v_day+1;
    end loop;
    v_fees:=coalesce(v_config.cleaning_fee_gross,0); v_deposit:=coalesce(v_config.deposit_gross,0);
  end if;

  if v_start<now()+make_interval(hours=>v_config.min_notice_hours) then raise exception 'Ten termin jest zbyt bliski'; end if;
  if v_start>now()+make_interval(days=>v_config.max_advance_days) then raise exception 'Nie można rezerwować z tak dużym wyprzedzeniem'; end if;

  update market.bookings set status='expired',updated_at=now() where status in('held','pending_payment') and hold_expires_at<=now();
  update market.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where offer_id=p_offer and buyer_id=v_uid and status='held';
  v_total:=round(v_base+v_fees,2);
  insert into market.bookings(offer_id,seller_id,buyer_id,booking_type,starts_at,ends_at,units,unit_price_gross,base_amount_gross,fees_gross,deposit_gross,amount_gross,status,hold_expires_at,service_id,resource_id)
  values(p_offer,v_offer.seller_id,v_uid,v_config.booking_type,v_start,v_end,v_units,round(case when v_units>0 then v_base/v_units else v_base end,2),round(v_base,2),round(v_fees,2),round(v_deposit,2),v_total,'held',v_expiry,p_service,v_resource)
  returning id into v_id;
  return query select v_id,v_start,v_end,round(v_base,2),round(v_fees,2),round(v_deposit,2),v_total,v_expiry;
end;
$$;

revoke all on function market.create_booking_hold_v2(uuid,timestamptz,timestamptz,uuid,uuid) from public;
revoke execute on function market.create_booking_hold_v2(uuid,timestamptz,timestamptz,uuid,uuid) from anon;
grant execute on function market.create_booking_hold_v2(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated;

grant execute on function market.booking_unavailable_days_v2(uuid,date,date) to anon, authenticated;
grant execute on function market.booking_daily_quote_v2(uuid,date,date) to anon, authenticated;
