-- Ogłoszenia lokalne (w tym Praca) jako ogłoszenia bezpłatne.
-- Decyzja właściciela 2026-09-15: kategoria "Ogłoszenia lokalne" nie sprzedaje niczego,
-- więc nie ma od czego liczyć prowizji. Ogłoszenie kosztuje 0 zł, bez prowizji
-- ambasadorskich i bez cashbacku. Cena 0 jest dopuszczona WYŁĄCZNIE w gałęzi
-- 'ogloszenia-lokalne' — w każdej innej kategorii nadal obowiązuje zakaz publikacji
-- bez dodatniej ceny.

create or replace function market.create_offer_v2(
  p_title text, p_description text, p_price numeric, p_stock integer,
  p_category_slug text, p_image_urls text[] default null::text[],
  p_commission_model text default 'cashback_only'::text,
  p_attributes jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_seller uuid := market.current_seller_id();
  v_cat uuid;
  v_id uuid;
  v_main_image text;
  v_status text;
  v_purchase_mode text := coalesce(p_attributes ->> 'purchase_mode', 'purchase');
  v_root_slug text;
  v_ogloszenie boolean;
  v_model text := p_commission_model;
  v_attrs jsonb := coalesce(p_attributes, '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not market.current_seller_can_sell() then
    raise exception 'Brak aktywnego dostępu Partnera Handlowego. Odnów członkostwo, aby wystawiać nowe oferty.';
  end if;

  select c.id, coalesce(pc.slug, c.slug)
    into v_cat, v_root_slug
    from market.categories c
    left join market.categories pc on pc.id = c.parent_id
   where c.slug = p_category_slug;
  if v_cat is null then raise exception 'Nieznana kategoria'; end if;

  v_ogloszenie := (v_root_slug = 'ogloszenia-lokalne');

  if coalesce(trim(p_title),'')='' then raise exception 'Podaj nazwę produktu'; end if;

  if p_price is null or p_price < 0 then raise exception 'Nieprawidłowa cena'; end if;
  if p_price = 0 and not v_ogloszenie then raise exception 'Nieprawidłowa cena'; end if;

  if v_model not in ('cashback_only','mlm_full') then raise exception 'Nieprawidłowy model prowizji'; end if;
  if v_purchase_mode not in ('purchase','appointment','daily') then raise exception 'Nieprawidłowy tryb oferty'; end if;

  if v_ogloszenie and p_price = 0 then
    v_model := 'cashback_only';
    v_purchase_mode := 'purchase';
    v_attrs := v_attrs
      || jsonb_build_object('purchase_mode','purchase','listing_kind','ogloszenie','free_listing', true);
  end if;

  v_main_image := case when coalesce(array_length(p_image_urls,1),0)>0 then p_image_urls[1] else null end;
  v_status := case when v_purchase_mode in ('appointment','daily') then 'paused' else 'active' end;

  insert into market.offers(seller_id,category_id,title,description,price_gross,stock,status,image_url,commission_model,attributes)
  values(v_seller,v_cat,trim(p_title),nullif(trim(p_description),''),p_price,greatest(coalesce(p_stock,0),0),v_status,nullif(v_main_image,''),v_model,v_attrs)
  returning id into v_id;

  if coalesce(array_length(p_image_urls,1),0)>1 then
    insert into market.offer_images(offer_id,url,sort)
    select v_id,u.url,u.ord::int-1 from unnest(p_image_urls) with ordinality as u(url,ord)
    where u.ord>1 and coalesce(trim(u.url),'')<>'';
  end if;
  return v_id;
end;
$function$;

-- Kontakt typu "application" — kandydat odpowiadający na ogłoszenie o pracę.
-- Nie wymaga terminu; poza tym zachowuje się jak zwykłe zapytanie do sprzedawcy.
create or replace function market.create_interaction_request(
  p_offer uuid, p_type text, p_name text, p_email text default null::text,
  p_phone text default null::text, p_appointment_at timestamp with time zone default null::timestamp with time zone,
  p_message text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'market', 'public'
as $function$
declare
  v_offer market.offers%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_type,'')));
begin
  if v_type not in ('viewing','consultation','installation','quote','demo','reservation','contact','application') then raise exception 'Nieprawidłowy typ kontaktu'; end if;
  select * into v_offer from market.offers where id=p_offer and status='active';
  if v_offer.id is null then raise exception 'Oferta jest niedostępna'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Podaj imię'; end if;
  if nullif(btrim(coalesce(p_email,'')),'') is null and nullif(btrim(coalesce(p_phone,'')),'') is null then raise exception 'Podaj e-mail lub telefon'; end if;
  if v_type in ('viewing','consultation','installation','demo','reservation') and (p_appointment_at is null or p_appointment_at < now() + interval '30 minutes') then raise exception 'Wybierz przyszły termin'; end if;
  perform market._assert_lead_rate_limit(p_offer, p_email, p_phone, v_uid);
  insert into market.offer_leads(offer_id,seller_id,user_id,name,email,phone,message,status,source,appointment_at,interaction_type)
  values (v_offer.id,v_offer.seller_id,v_uid,left(btrim(p_name),120),nullif(left(btrim(coalesce(p_email,'')),240),''),nullif(left(btrim(coalesce(p_phone,'')),80),''),nullif(left(btrim(coalesce(p_message,'')),1000),''),'new','buyer_action',p_appointment_at,v_type)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Pola formularza ogłoszenia o pracę. Kreator renderuje je z market.category_attributes.
insert into market.category_attributes (category_id, key, label, data_type, required, options)
select c.id, v.key, v.label, v.data_type, v.required, v.options
from market.categories c
cross join (values
  ('employer',        'Pracodawca',            'text', true,  null::jsonb),
  ('employment_type', 'Rodzaj umowy',          'enum', true,  '["Umowa o pracę","Zlecenie","B2B","Dzieło","Staż / praktyka","Praca dorywcza"]'::jsonb),
  ('work_schedule',   'Wymiar',                'enum', true,  '["Pełny etat","Część etatu","Zmianowa","Weekendowa","Elastyczna"]'::jsonb),
  ('work_mode',       'Tryb pracy',            'enum', false, '["Stacjonarnie","Hybrydowo","Zdalnie"]'::jsonb),
  ('salary_from',     'Wynagrodzenie od (zł)', 'number', false, null::jsonb),
  ('salary_to',       'Wynagrodzenie do (zł)', 'number', false, null::jsonb),
  ('salary_period',   'Okres wynagrodzenia',   'enum', false, '["miesięcznie","godzinowo","za zlecenie"]'::jsonb),
  ('contact_person',  'Osoba kontaktowa',      'text', false, null::jsonb)
) as v(key,label,data_type,required,options)
where c.slug = 'ogloszenia-lokalne-praca'
  and not exists (select 1 from market.category_attributes a where a.category_id = c.id and a.key = v.key);
