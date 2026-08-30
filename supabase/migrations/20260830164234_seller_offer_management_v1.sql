-- Stable seller identity + safe offer management for owners/operators.
alter table market.sellers add column if not exists auth_user_id uuid;

update market.sellers s
set auth_user_id = u.id
from auth.users u
where s.auth_user_id is null
  and lower(s.email) = lower(u.email)
  and not exists (
    select 1 from market.sellers sx
    where sx.auth_user_id = u.id and sx.id <> s.id
  );

create unique index if not exists sellers_auth_user_id_uidx
  on market.sellers(auth_user_id)
  where auth_user_id is not null;

create or replace function market.current_seller_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id
  from market.sellers s
  where auth.uid() is not null
    and (
      s.auth_user_id = auth.uid()
      or (s.auth_user_id is null and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email','')))
    )
  order by (s.auth_user_id = auth.uid()) desc, (s.status = 'active') desc, s.created_at desc
  limit 1;
$$;
revoke execute on function market.current_seller_id() from public, anon;
grant execute on function market.current_seller_id() to authenticated, service_role;

create or replace function market.my_seller()
returns table(id uuid, legal_name text, status text, connect_status text, payouts_enabled boolean, stripe_account_id text)
language sql stable security definer
set search_path = ''
as $$
  select s.id, s.legal_name, s.status, s.connect_status, s.payouts_enabled, s.stripe_account_id
  from market.sellers s
  where s.id = market.current_seller_id()
  limit 1;
$$;

create or replace function market.my_offers()
returns table(offer_id uuid, title text, price_gross numeric, stock integer, status text, category text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select o.id, o.title, o.price_gross, o.stock, o.status, c.name, o.created_at
  from market.offers o
  join market.categories c on c.id = o.category_id
  where o.seller_id = market.current_seller_id() or market.is_operator()
  order by o.created_at desc;
$$;

create or replace function market.get_offer_for_manage(p_offer uuid)
returns table(
  offer_id uuid, title text, description text, price_gross numeric, stock integer,
  status text, category text, commission_model text, attributes jsonb, image_urls text[]
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if not exists (
    select 1 from market.offers o
    where o.id = p_offer
      and (o.seller_id = market.current_seller_id() or market.is_operator())
  ) then raise exception 'Brak dostępu do oferty'; end if;

  return query
  select o.id, o.title, o.description, o.price_gross, o.stock, o.status, c.name,
         o.commission_model, coalesce(o.attributes, '{}'::jsonb),
         coalesce(
           array_remove(array_prepend(o.image_url,
             array(select i.url from market.offer_images i where i.offer_id = o.id order by i.sort, i.id)
           ), null), array[]::text[]
         )
  from market.offers o
  join market.categories c on c.id = o.category_id
  where o.id = p_offer;
end;
$$;

create or replace function market.update_offer_manage(
  p_offer uuid, p_title text, p_description text, p_price numeric, p_stock integer,
  p_image_urls text[], p_commission_model text, p_attributes jsonb default '{}'::jsonb
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare v_main text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'Podaj tytuł'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Nieprawidłowa cena'; end if;
  if p_commission_model not in ('cashback_only','mlm_full') then raise exception 'Nieprawidłowy model prowizji'; end if;
  if not exists (
    select 1 from market.offers o
    where o.id = p_offer
      and (o.seller_id = market.current_seller_id() or market.is_operator())
  ) then raise exception 'Brak dostępu do oferty'; end if;

  v_main := case when coalesce(array_length(p_image_urls,1),0) > 0 then nullif(trim(p_image_urls[1]),'') else null end;
  update market.offers
  set title = trim(p_title), description = nullif(trim(p_description),''), price_gross = p_price,
      stock = greatest(coalesce(p_stock,0),0), image_url = v_main,
      commission_model = p_commission_model, attributes = coalesce(p_attributes,'{}'::jsonb), updated_at = now()
  where id = p_offer;

  delete from market.offer_images where offer_id = p_offer;
  if coalesce(array_length(p_image_urls,1),0) > 1 then
    insert into market.offer_images(offer_id,url,sort)
    select p_offer, u.url, u.ord::int - 1
    from unnest(p_image_urls) with ordinality as u(url,ord)
    where u.ord > 1 and coalesce(trim(u.url),'') <> '';
  end if;
  return true;
end;
$$;

revoke execute on function market.get_offer_for_manage(uuid) from public, anon;
revoke execute on function market.update_offer_manage(uuid,text,text,numeric,integer,text[],text,jsonb) from public, anon;
grant execute on function market.get_offer_for_manage(uuid) to authenticated, service_role;
grant execute on function market.update_offer_manage(uuid,text,text,numeric,integer,text[],text,jsonb) to authenticated, service_role;

create or replace function market.become_seller(p_legal_name text, p_nip text default null, p_accept boolean default false)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_id uuid;
begin
  if v_uid is null or v_email is null then raise exception 'Brak autoryzacji'; end if;
  if not coalesce(p_accept,false) then raise exception 'Musisz zaakceptować Regulamin sprzedawcy i Regulamin Sunrise Pay'; end if;
  select s.id into v_id from market.sellers s
  where s.auth_user_id = v_uid or (s.auth_user_id is null and lower(s.email)=lower(v_email))
  order by (s.auth_user_id=v_uid) desc, (s.status='active') desc limit 1;
  if v_id is null then
    insert into market.sellers(legal_name,email,nip,status,kyc_status,seller_type,terms_accepted_at,auth_user_id)
    values(coalesce(nullif(p_legal_name,''),'Sprzedawca'),v_email,p_nip,'active','verified','business',now(),v_uid)
    returning id into v_id;
    insert into market.seller_contexts(seller_id,context,enabled) values(v_id,'market',true) on conflict do nothing;
  else
    update market.sellers set auth_user_id=coalesce(auth_user_id,v_uid), terms_accepted_at=coalesce(terms_accepted_at,now()) where id=v_id;
  end if;
  perform market.activate_pay(v_id);
  return v_id;
end;
$$;

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
  v_cat uuid; v_id uuid; v_main_image text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.sellers s where s.id=v_seller and s.status='active') then raise exception 'Brak aktywnego konta sprzedawcy'; end if;
  select c.id into v_cat from market.categories c where c.slug=p_category_slug;
  if v_cat is null then raise exception 'Nieznana kategoria'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Podaj nazwę produktu'; end if;
  if p_price is null or p_price<=0 then raise exception 'Nieprawidłowa cena'; end if;
  if p_commission_model not in ('cashback_only','mlm_full') then raise exception 'Nieprawidłowy model prowizji'; end if;
  v_main_image := case when coalesce(array_length(p_image_urls,1),0)>0 then p_image_urls[1] else null end;
  insert into market.offers(seller_id,category_id,title,description,price_gross,stock,status,image_url,commission_model,attributes)
  values(v_seller,v_cat,trim(p_title),nullif(trim(p_description),''),p_price,greatest(coalesce(p_stock,0),0),'active',nullif(v_main_image,''),p_commission_model,coalesce(p_attributes,'{}'::jsonb))
  returning id into v_id;
  if coalesce(array_length(p_image_urls,1),0)>1 then
    insert into market.offer_images(offer_id,url,sort)
    select v_id,u.url,u.ord::int-1 from unnest(p_image_urls) with ordinality as u(url,ord)
    where u.ord>1 and coalesce(trim(u.url),'')<>'';
  end if;
  return v_id;
end;
$$;

revoke execute on function market.my_seller() from public, anon;
revoke execute on function market.my_offers() from public, anon;
revoke execute on function market.become_seller(text,text,boolean) from public, anon;
revoke execute on function market.create_offer_v2(text,text,numeric,integer,text,text[],text,jsonb) from public, anon;
grant execute on function market.my_seller() to authenticated, service_role;
grant execute on function market.my_offers() to authenticated, service_role;
grant execute on function market.become_seller(text,text,boolean) to authenticated, service_role;
grant execute on function market.create_offer_v2(text,text,numeric,integer,text,text[],text,jsonb) to authenticated, service_role;
