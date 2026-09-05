-- 2026-09-06: numer telefonu sprzedawcy w ogłoszeniu („Pokaż numer”) — opt-in sprzedawcy, widoczny tylko zalogowanym.
alter table market.sellers add column if not exists phone_public boolean not null default false;

create or replace function market.my_contact_settings()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('phone', s.phone, 'phone_public', s.phone_public)
  from market.sellers s where s.id = market.current_seller_id();
$$;

create or replace function market.set_contact_settings(p_phone text, p_public boolean)
returns jsonb language plpgsql security definer set search_path to 'market','public' as $$
declare v_id uuid := market.current_seller_id(); v_phone text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9+ ]', '', 'g'), '');
begin
  if v_id is null then raise exception 'Brak konta sprzedawcy'; end if;
  if p_public and (v_phone is null or length(regexp_replace(v_phone,'[^0-9]','','g')) < 9) then raise exception 'Podaj prawidłowy numer telefonu (min. 9 cyfr)'; end if;
  update market.sellers set phone = coalesce(v_phone, phone), phone_public = p_public, updated_at = now() where id = v_id;
  return market.my_contact_settings();
end $$;

-- Numer do oferty: tylko dla zalogowanych, tylko gdy sprzedawca włączył publikację
create or replace function market.offer_seller_phone(p_offer uuid)
returns text language sql stable security definer set search_path to '' as $$
  select case when auth.uid() is null then null when s.phone_public then s.phone else null end
  from market.offers o join market.sellers s on s.id = o.seller_id where o.id = p_offer and o.status = 'active';
$$;

create or replace function market.offer_has_phone(p_offer uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select s.phone_public and s.phone is not null from market.offers o join market.sellers s on s.id = o.seller_id where o.id = p_offer and o.status = 'active'), false);
$$;

revoke all on function market.my_contact_settings(), market.set_contact_settings(text,boolean), market.offer_seller_phone(uuid), market.offer_has_phone(uuid) from public;
grant execute on function market.my_contact_settings(), market.set_contact_settings(text,boolean), market.offer_seller_phone(uuid) to authenticated, service_role;
grant execute on function market.offer_has_phone(uuid) to anon, authenticated, service_role;
