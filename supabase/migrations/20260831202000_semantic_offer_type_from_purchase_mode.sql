-- Keep generic offer metadata consistent with the three seller modes.
-- Preserve specialist offer_type values such as samochod/nieruchomosc/usluga.

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
  v_attrs jsonb := coalesce(p_attributes,'{}'::jsonb);
  v_mode text;
  v_offer_type text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.sellers s where s.id=v_seller and s.status='active') then raise exception 'Brak aktywnego konta sprzedawcy'; end if;

  select c.id into v_cat from market.categories c where c.slug=p_category_slug;
  if v_cat is null then raise exception 'Nieznana kategoria'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Podaj nazwę produktu'; end if;
  if p_price is null or p_price<=0 then raise exception 'Nieprawidłowa cena'; end if;
  if p_commission_model not in ('cashback_only','mlm_full') then raise exception 'Nieprawidłowy model prowizji'; end if;

  v_mode := coalesce(nullif(trim(v_attrs->>'purchase_mode'),''),'purchase');
  v_offer_type := coalesce(nullif(trim(v_attrs->>'offer_type'),''),'product');
  if v_offer_type='product' then
    v_offer_type := case
      when v_mode='appointment' then 'service'
      when v_mode='daily' then 'rental'
      else 'product'
    end;
    v_attrs := jsonb_set(v_attrs,'{offer_type}',to_jsonb(v_offer_type),true);
  end if;

  v_main_image := case when coalesce(array_length(p_image_urls,1),0)>0 then p_image_urls[1] else null end;
  insert into market.offers(seller_id,category_id,title,description,price_gross,stock,status,image_url,commission_model,attributes)
  values(v_seller,v_cat,trim(p_title),nullif(trim(p_description),''),p_price,greatest(coalesce(p_stock,0),0),'active',nullif(v_main_image,''),p_commission_model,v_attrs)
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

-- Backfill only generic records. Specialist metadata remains untouched.
update market.offers
set attributes = jsonb_set(
      coalesce(attributes,'{}'::jsonb),
      '{offer_type}',
      to_jsonb(case attributes->>'purchase_mode'
        when 'appointment' then 'service'
        when 'daily' then 'rental'
        else 'product'
      end),
      true
    ),
    updated_at = now()
where coalesce(attributes->>'offer_type','product')='product'
  and attributes->>'purchase_mode' in ('appointment','daily');