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
  v_count integer := coalesce(p_count,1);
  v_base text := trim(coalesce(p_name,''));
  v_id uuid;
  v_created integer := 0;
  v_suffix integer := 1;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if v_seller is null or not exists(
    select 1 from market.offers o where o.id=p_offer and o.seller_id=v_seller
  ) then raise exception 'Brak dostępu do oferty'; end if;
  if v_base='' then raise exception 'Podaj nazwę zasobu'; end if;
  if p_kind not in ('staff','vehicle','property','room','equipment','other') then raise exception 'Nieprawidłowy typ zasobu'; end if;
  if v_count < 1 or v_count > 50 then raise exception 'Możesz dodać od 1 do 50 egzemplarzy naraz'; end if;

  while v_created < v_count loop
    if v_count=1 and v_created=0 and not exists(
      select 1 from market.booking_resources r
      where r.seller_id=v_seller and lower(trim(r.name))=lower(v_base)
    ) then
      v_name := v_base;
    else
      loop
        v_name := v_base||' #'||v_suffix::text;
        v_suffix := v_suffix + 1;
        exit when not exists(
          select 1 from market.booking_resources r
          where r.seller_id=v_seller and lower(trim(r.name))=lower(v_name)
        );
      end loop;
    end if;

    insert into market.booking_resources(seller_id,name,kind,description,active)
    values(v_seller,v_name,p_kind,nullif(trim(coalesce(p_description,'')),''),true)
    returning id into v_id;

    insert into market.booking_offer_resources(offer_id,resource_id)
    values(p_offer,v_id);

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) from public;
revoke execute on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) from anon;
grant execute on function market.seller_booking_resources_batch_create(uuid,text,text,text,integer) to authenticated;
