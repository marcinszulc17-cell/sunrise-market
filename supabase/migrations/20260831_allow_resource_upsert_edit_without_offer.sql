create or replace function market.seller_booking_resource_upsert(
  p_offer uuid,
  p_id uuid,
  p_name text,
  p_kind text,
  p_description text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Podaj nazwę zasobu'; end if;
  if p_kind not in ('staff','vehicle','property','room','equipment','other') then raise exception 'Nieprawidłowy typ zasobu'; end if;

  if p_id is null then
    if p_offer is null or not exists(select 1 from market.offers where id=p_offer and seller_id=v_seller) then
      raise exception 'Brak dostępu do oferty';
    end if;
    insert into market.booking_resources(seller_id,name,kind,description,active)
    values(v_seller,trim(p_name),p_kind,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true))
    returning id into v_id;
    insert into market.booking_offer_resources(offer_id,resource_id)
    values(p_offer,v_id) on conflict do nothing;
  else
    update market.booking_resources
    set name=trim(p_name),kind=p_kind,description=nullif(trim(coalesce(p_description,'')),''),active=coalesce(p_active,true),updated_at=now()
    where id=p_id and seller_id=v_seller
    returning id into v_id;
    if v_id is null then raise exception 'Nie znaleziono zasobu'; end if;

    if p_offer is not null then
      if not exists(select 1 from market.offers where id=p_offer and seller_id=v_seller) then
        raise exception 'Brak dostępu do oferty';
      end if;
      insert into market.booking_offer_resources(offer_id,resource_id)
      values(p_offer,v_id) on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function market.seller_booking_resource_upsert(uuid,uuid,text,text,text,boolean) from public;
revoke execute on function market.seller_booking_resource_upsert(uuid,uuid,text,text,text,boolean) from anon;
grant execute on function market.seller_booking_resource_upsert(uuid,uuid,text,text,text,boolean) to authenticated;
