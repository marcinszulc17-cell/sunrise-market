-- Booking offers must not be publicly visible before the seller finishes calendar setup.
-- Regular purchase offers keep the existing immediate-publication behaviour.

create or replace function market.create_offer_v2(
  p_title text, p_description text, p_price numeric, p_stock integer, p_category_slug text,
  p_image_urls text[] default null, p_commission_model text default 'cashback_only', p_attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_cat uuid;
  v_id uuid;
  v_main_image text;
  v_status text;
  v_purchase_mode text := coalesce(p_attributes ->> 'purchase_mode', 'purchase');
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.sellers s where s.id=v_seller and s.status='active') then raise exception 'Brak aktywnego konta sprzedawcy'; end if;
  select c.id into v_cat from market.categories c where c.slug=p_category_slug;
  if v_cat is null then raise exception 'Nieznana kategoria'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Podaj nazwę produktu'; end if;
  if p_price is null or p_price<=0 then raise exception 'Nieprawidłowa cena'; end if;
  if p_commission_model not in ('cashback_only','mlm_full') then raise exception 'Nieprawidłowy model prowizji'; end if;
  if v_purchase_mode not in ('purchase','appointment','daily') then raise exception 'Nieprawidłowy tryb oferty'; end if;

  v_main_image := case when coalesce(array_length(p_image_urls,1),0)>0 then p_image_urls[1] else null end;
  v_status := case when v_purchase_mode in ('appointment','daily') then 'paused' else 'active' end;

  insert into market.offers(seller_id,category_id,title,description,price_gross,stock,status,image_url,commission_model,attributes)
  values(v_seller,v_cat,trim(p_title),nullif(trim(p_description),''),p_price,greatest(coalesce(p_stock,0),0),v_status,nullif(v_main_image,''),p_commission_model,coalesce(p_attributes,'{}'::jsonb))
  returning id into v_id;

  if coalesce(array_length(p_image_urls,1),0)>1 then
    insert into market.offer_images(offer_id,url,sort)
    select v_id,u.url,u.ord::int-1 from unnest(p_image_urls) with ordinality as u(url,ord)
    where u.ord>1 and coalesce(trim(u.url),'')<>'';
  end if;
  return v_id;
end;
$$;

revoke execute on function market.create_offer_v2(text,text,numeric,integer,text,text[],text,jsonb) from public, anon;
grant execute on function market.create_offer_v2(text,text,numeric,integer,text,text[],text,jsonb) to authenticated, service_role;

create or replace function market.configure_booking_offer(
  p_offer uuid,
  p_booking_type text,
  p_timezone text default 'Europe/Warsaw',
  p_duration_minutes integer default null,
  p_slot_interval_minutes integer default 30,
  p_min_notice_hours integer default 2,
  p_max_advance_days integer default 180,
  p_max_units integer default 30,
  p_price_per_unit numeric default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer market.offers%rowtype;
  v_seller uuid := market.current_seller_id();
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;

  select o.* into v_offer
  from market.offers o
  where o.id = p_offer and o.seller_id = v_seller;
  if v_offer.id is null then raise exception 'Brak dostępu do oferty'; end if;
  if p_booking_type not in ('appointment','daily') then raise exception 'Nieprawidłowy typ rezerwacji'; end if;
  if p_booking_type = 'appointment' and coalesce(p_duration_minutes, 0) < 15 then raise exception 'Podaj czas trwania usługi'; end if;
  if p_booking_type = 'daily' then p_duration_minutes := null; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Nieprawidłowa strefa czasowa'; end if;

  insert into market.booking_offers(
    offer_id, seller_id, booking_type, timezone, duration_minutes,
    slot_interval_minutes, min_notice_hours, max_advance_days,
    max_units, price_per_unit, active, updated_at
  ) values (
    p_offer, v_offer.seller_id, p_booking_type, p_timezone, p_duration_minutes,
    p_slot_interval_minutes, p_min_notice_hours, p_max_advance_days,
    p_max_units, p_price_per_unit, p_active, now()
  )
  on conflict (offer_id) do update set
    seller_id = excluded.seller_id,
    booking_type = excluded.booking_type,
    timezone = excluded.timezone,
    duration_minutes = excluded.duration_minutes,
    slot_interval_minutes = excluded.slot_interval_minutes,
    min_notice_hours = excluded.min_notice_hours,
    max_advance_days = excluded.max_advance_days,
    max_units = excluded.max_units,
    price_per_unit = excluded.price_per_unit,
    active = excluded.active,
    updated_at = now();

  -- A newly created booking offer starts hidden. Publishing the calendar is the
  -- explicit moment when that offer may become visible to customers.
  -- Disabling booking later does not auto-hide an already published offer.
  if p_active then
    update market.offers
    set status = 'active', updated_at = now()
    where id = p_offer
      and seller_id = v_seller
      and status = 'paused'
      and coalesce(attributes ->> 'purchase_mode', '') in ('appointment','daily');
  end if;
end;
$$;

revoke execute on function market.configure_booking_offer(uuid,text,text,integer,integer,integer,integer,integer,numeric,boolean) from public, anon;
grant execute on function market.configure_booking_offer(uuid,text,text,integer,integer,integer,integer,integer,numeric,boolean) to authenticated;
