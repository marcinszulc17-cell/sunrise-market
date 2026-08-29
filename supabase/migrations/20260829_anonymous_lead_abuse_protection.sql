-- Low-friction abuse protection for public lead / interaction RPCs.
-- We deliberately keep these actions available to anonymous buyers, but add
-- transactional duplicate and rolling-volume limits based on the contact data
-- already stored with the lead. IP-aware throttling can be layered at Edge later.

create or replace function market._assert_lead_rate_limit(
  p_offer uuid,
  p_email text,
  p_phone text,
  p_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = market, public
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_contact_key text;
  v_count integer;
begin
  v_contact_key := coalesce(v_email, '') || '|' || coalesce(v_phone, '') || '|' || coalesce(p_user::text, 'anon');

  -- Serialize submissions for the same offer/contact to close race conditions.
  perform pg_advisory_xact_lock(hashtextextended(p_offer::text || '|' || v_contact_key, 0));

  -- Exact same contact + offer: one submission per 10 minutes.
  select count(*) into v_count
  from market.offer_leads l
  where l.offer_id = p_offer
    and l.created_at >= now() - interval '10 minutes'
    and (
      (v_email is not null and lower(btrim(coalesce(l.email, ''))) = v_email)
      or
      (v_phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9+]', '', 'g') = v_phone)
      or
      (p_user is not null and l.user_id = p_user)
    );

  if v_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'To zgłoszenie zostało już wysłane. Spróbuj ponownie za kilka minut.';
  end if;

  -- Contact-wide burst protection: max 5 submissions/hour.
  select count(*) into v_count
  from market.offer_leads l
  where l.created_at >= now() - interval '1 hour'
    and (
      (v_email is not null and lower(btrim(coalesce(l.email, ''))) = v_email)
      or
      (v_phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9+]', '', 'g') = v_phone)
      or
      (p_user is not null and l.user_id = p_user)
    );

  if v_count >= 5 then
    raise exception using
      errcode = 'P0001',
      message = 'Wysłano zbyt wiele zgłoszeń w krótkim czasie. Spróbuj ponownie później.';
  end if;

  -- Longer rolling cap limits scripted spam while remaining generous for real buyers.
  select count(*) into v_count
  from market.offer_leads l
  where l.created_at >= now() - interval '24 hours'
    and (
      (v_email is not null and lower(btrim(coalesce(l.email, ''))) = v_email)
      or
      (v_phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9+]', '', 'g') = v_phone)
      or
      (p_user is not null and l.user_id = p_user)
    );

  if v_count >= 20 then
    raise exception using
      errcode = 'P0001',
      message = 'Osiągnięto dzienny limit zgłoszeń. Spróbuj ponownie jutro.';
  end if;
end;
$$;

revoke all on function market._assert_lead_rate_limit(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function market._assert_lead_rate_limit(uuid, text, text, uuid) to service_role;

create index if not exists offer_leads_offer_email_created_idx
  on market.offer_leads (offer_id, lower(email), created_at desc)
  where email is not null;

create index if not exists offer_leads_email_created_idx
  on market.offer_leads (lower(email), created_at desc)
  where email is not null;

create index if not exists offer_leads_user_created_idx
  on market.offer_leads (user_id, created_at desc)
  where user_id is not null;

create or replace function market.create_offer_lead(
  p_offer uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = market, public
as $$
declare
  v_seller uuid;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if coalesce(length(trim(p_name)),0) < 2 then raise exception 'Podaj imię'; end if;
  if coalesce(length(trim(p_email)),0) = 0 and coalesce(length(trim(p_phone)),0) = 0 then
    raise exception 'Podaj e-mail lub telefon';
  end if;

  select seller_id into v_seller from market.offers where id=p_offer and status='active';
  if v_seller is null then raise exception 'Oferta nie jest aktywna'; end if;

  perform market._assert_lead_rate_limit(p_offer, p_email, p_phone, v_uid);

  insert into market.offer_leads(offer_id,seller_id,user_id,name,email,phone,message)
  values (p_offer,v_seller,v_uid,left(trim(p_name),120),nullif(left(trim(p_email),200),''),nullif(left(trim(p_phone),80),''),nullif(left(trim(p_message),2000),''))
  returning id into v_id;
  return v_id;
end;
$$;

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
set search_path = market, public
as $$
declare
  v_offer market.offers%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_type,'')));
begin
  if v_type not in ('viewing','consultation','installation','quote','demo','reservation','contact') then raise exception 'Nieprawidłowy typ kontaktu'; end if;
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
$$;

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
set search_path = market, public
as $$
declare
  v_offer market.offers%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  select * into v_offer from market.offers where id=p_offer and status='active';
  if v_offer.id is null then raise exception 'Oferta jest niedostępna'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Podaj imię'; end if;
  if nullif(btrim(coalesce(p_email,'')),'') is null and nullif(btrim(coalesce(p_phone,'')),'') is null then raise exception 'Podaj e-mail lub telefon'; end if;
  if p_appointment_at is null or p_appointment_at < now() + interval '30 minutes' then raise exception 'Wybierz przyszły termin'; end if;

  perform market._assert_lead_rate_limit(p_offer, p_email, p_phone, v_uid);

  insert into market.offer_leads(offer_id,seller_id,user_id,name,email,phone,message,status,source,appointment_at)
  values (v_offer.id,v_offer.seller_id,v_uid,left(btrim(p_name),120),nullif(left(btrim(coalesce(p_email,'')),240),''),nullif(left(btrim(coalesce(p_phone,'')),80),''),nullif(left(btrim(coalesce(p_message,'')),1000),''),'new','viewing',p_appointment_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- Preserve the intentional public buyer surface; only the internal guard is private.
grant execute on function market.create_offer_lead(uuid, text, text, text, text) to anon, authenticated, service_role;
grant execute on function market.create_interaction_request(uuid, text, text, text, text, timestamptz, text) to anon, authenticated, service_role;
grant execute on function market.create_viewing_request(uuid, text, text, text, timestamptz, text) to anon, authenticated, service_role;
