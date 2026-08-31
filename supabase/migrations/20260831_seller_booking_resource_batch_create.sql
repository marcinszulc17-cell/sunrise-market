create or replace function market.seller_booking_resources_batch_create(
  p_offer uuid,
  p_name text,
  p_kind text,
  p_description text default null,
  p_count integer default 1
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_count integer := greatest(1, least(coalesce(p_count,1),50));
  v_id uuid;
  i integer;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null or not exists(
    select 1 from market.offers o where o.id=p_offer and o.seller_id=v_seller
  ) then raise exception 'Brak dostępu do oferty'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Podaj nazwę zasobu'; end if;
  if p_kind not in ('staff','vehicle','property','room','equipment','other') then raise exception 'Nieprawidłowy typ zasobu'; end if;
  if coalesce(p_count,1) < 1 or coalesce(p_count,1) > 50 then raise exception 'Możesz dodać od 1 do 50 egzemplarzy naraz'; end if;

  for i in 1..v_count loop
    v_name := case when v_count=1 then trim(p_name) else trim(p_name)||' '||i::text end;
    insert into market.booking_resources(seller_id,name,kind,description,active)
    values(v_seller,v_name,p_kind,nullif(trim(coalesce(p_description,'')),''),true)
    returning id into v_id;

    insert into market.booking_offer_resources(offer_id,resource_id)
    values(p_offer,v_id)
    on conflict do nothing;
  end loop;

  return v_count;
end;
$$;

revoke all on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) from public;
revoke execute on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) from anon;
grant execute on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) to authenticated;
