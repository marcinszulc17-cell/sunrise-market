-- Buyer tools: price-drop preference and appointment requests.

alter table market.offer_leads
  add column if not exists appointment_at timestamptz;

create or replace function market.set_watch_alert(p_offer uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Zaloguj się'; end if;
  update market.watchlist
     set notify_drop = coalesce(p_enabled, true)
   where user_id = v_uid and offer_id = p_offer;
  if not found then raise exception 'Najpierw dodaj ofertę do obserwowanych'; end if;
  return coalesce(p_enabled, true);
end;
$$;
revoke execute on function market.set_watch_alert(uuid,boolean) from public, anon;
grant execute on function market.set_watch_alert(uuid,boolean) to authenticated;

create or replace function market.create_viewing_request(
  p_offer uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_appointment_at timestamptz,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_offer market.offers%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  select * into v_offer from market.offers where id=p_offer and status='active';
  if v_offer.id is null then raise exception 'Oferta jest niedostępna'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Podaj imię'; end if;
  if nullif(btrim(coalesce(p_email,'')),'') is null and nullif(btrim(coalesce(p_phone,'')),'') is null then
    raise exception 'Podaj e-mail lub telefon';
  end if;
  if p_appointment_at is null or p_appointment_at < now() + interval '30 minutes' then
    raise exception 'Wybierz przyszły termin';
  end if;

  insert into market.offer_leads(offer_id,seller_id,user_id,name,email,phone,message,status,source,appointment_at)
  values (
    v_offer.id, v_offer.seller_id, v_uid,
    left(btrim(p_name),120), nullif(left(btrim(coalesce(p_email,'')),240),''),
    nullif(left(btrim(coalesce(p_phone,'')),80),''),
    nullif(left(btrim(coalesce(p_message,'')),1000),''),
    'new','viewing',p_appointment_at
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function market.create_viewing_request(uuid,text,text,text,timestamptz,text) from public;
grant execute on function market.create_viewing_request(uuid,text,text,text,timestamptz,text) to anon, authenticated;

create or replace function market.my_watchlist()
returns setof jsonb
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
  select to_jsonb(r) from (
    select o.id as offer_id, o.title, o.price_gross, o.image_url, c.name as category, s.legal_name as seller,
           w.price_at_add, (o.price_gross < w.price_at_add) as price_dropped, w.notify_drop,
           case when o.price_gross < w.price_at_add then (w.price_at_add-o.price_gross) else 0 end as price_drop_amount,
           coalesce(round(avg(rv.rating)::numeric,1),0) as rating, count(rv.id)::int as reviews
    from market.watchlist w
    join market.offers o on o.id=w.offer_id
    join market.categories c on c.id=o.category_id
    join market.sellers s on s.id=o.seller_id
    left join market.reviews rv on rv.offer_id=o.id
    where w.user_id=v_uid and o.status='active'
    group by o.id,o.title,o.price_gross,o.image_url,c.name,s.legal_name,w.price_at_add,w.notify_drop,w.created_at
    order by w.created_at desc
  ) r;
end;
$$;
revoke execute on function market.my_watchlist() from public, anon;
grant execute on function market.my_watchlist() to authenticated;

revoke execute on function market.toggle_watch(uuid) from public, anon;
grant execute on function market.toggle_watch(uuid) to authenticated;
revoke execute on function market.watched_ids() from public, anon;
grant execute on function market.watched_ids() to authenticated;
