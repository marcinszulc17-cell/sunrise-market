-- Category-aware buyer interaction layer + public cashback configuration.

alter table market.offer_leads
  add column if not exists interaction_type text;

create or replace function market.create_interaction_request(
  p_offer uuid,
  p_type text,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_appointment_at timestamptz default null,
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
  v_type text := lower(trim(coalesce(p_type,'')));
begin
  if v_type not in ('viewing','consultation','installation','quote','demo','reservation','contact') then
    raise exception 'Nieprawidłowy typ kontaktu';
  end if;
  select * into v_offer from market.offers where id=p_offer and status='active';
  if v_offer.id is null then raise exception 'Oferta jest niedostępna'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Podaj imię'; end if;
  if nullif(btrim(coalesce(p_email,'')),'') is null and nullif(btrim(coalesce(p_phone,'')),'') is null then
    raise exception 'Podaj e-mail lub telefon';
  end if;
  if v_type in ('viewing','consultation','installation','demo','reservation')
     and (p_appointment_at is null or p_appointment_at < now() + interval '30 minutes') then
    raise exception 'Wybierz przyszły termin';
  end if;

  insert into market.offer_leads(
    offer_id,seller_id,user_id,name,email,phone,message,status,source,appointment_at,interaction_type
  ) values (
    v_offer.id,v_offer.seller_id,v_uid,
    left(btrim(p_name),120),
    nullif(left(btrim(coalesce(p_email,'')),240),''),
    nullif(left(btrim(coalesce(p_phone,'')),80),''),
    nullif(left(btrim(coalesce(p_message,'')),1000),''),
    'new','buyer_action',p_appointment_at,v_type
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function market.create_interaction_request(uuid,text,text,text,text,timestamptz,text) from public;
grant execute on function market.create_interaction_request(uuid,text,text,text,text,timestamptz,text) to anon, authenticated;

create or replace function market.my_offer_leads_v2()
returns table(
  id uuid, offer_id uuid, title text, name text, email text, phone text, message text,
  status text, source text, interaction_type text, appointment_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select l.id,l.offer_id,o.title,l.name,l.email,l.phone,l.message,l.status,l.source,
         l.interaction_type,l.appointment_at,l.created_at
  from market.offer_leads l
  join market.offers o on o.id=l.offer_id
  join market.sellers s on s.id=l.seller_id
  where lower(s.email)=lower(auth.jwt()->>'email')
  order by l.created_at desc;
$$;
revoke execute on function market.my_offer_leads_v2() from public, anon;
grant execute on function market.my_offer_leads_v2() to authenticated;

create or replace function market.public_market_config()
returns jsonb
language sql
stable
security definer
set search_path to 'market','public'
as $$
  select jsonb_build_object(
    'cashback_rate', coalesce((select value::numeric from market.platform_config where key='cashback_rate'),0.03)
  );
$$;
grant execute on function market.public_market_config() to anon, authenticated;