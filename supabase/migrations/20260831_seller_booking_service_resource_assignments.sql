create or replace function market.seller_booking_catalog_v2(p_offer uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare v_seller uuid; v_cfg jsonb; begin
  v_seller:=market.current_seller_id();
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.offers where id=p_offer and seller_id=v_seller) then raise exception 'Brak dostępu do oferty'; end if;
  select jsonb_build_object(
    'offer', (select jsonb_build_object('category_slug',c.slug,'offer_type',coalesce(o.attributes->>'offer_type','')) from market.offers o left join market.categories c on c.id=o.category_id where o.id=p_offer),
    'config', (select to_jsonb(b) from market.booking_offers b where b.offer_id=p_offer),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort,s.name) from market.booking_services s where s.offer_id=p_offer),'[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from market.booking_offer_resources x join market.booking_resources r on r.id=x.resource_id where x.offer_id=p_offer),'[]'::jsonb),
    'service_resources', coalesce((select jsonb_agg(jsonb_build_object('service_id',sr.service_id,'resource_id',sr.resource_id) order by sr.service_id,sr.resource_id) from market.booking_service_resources sr join market.booking_services s on s.id=sr.service_id where s.offer_id=p_offer),'[]'::jsonb),
    'rates', coalesce((select jsonb_agg(to_jsonb(rr) order by rr.starts_on,rr.priority desc) from market.booking_rate_rules rr where rr.offer_id=p_offer),'[]'::jsonb)
  ) into v_cfg;
  return v_cfg;
end;$$;

create or replace function market.seller_booking_service_resources_replace(p_offer uuid,p_service uuid,p_resources uuid[])
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v_seller uuid:=market.current_seller_id();
  v_resources uuid[]:=coalesce(p_resources,array[]::uuid[]);
begin
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if not exists(select 1 from market.offers o where o.id=p_offer and o.seller_id=v_seller) then raise exception 'Brak dostępu do oferty'; end if;
  if not exists(select 1 from market.booking_services s where s.id=p_service and s.offer_id=p_offer) then raise exception 'Usługa nie należy do tej oferty'; end if;
  if exists(
    select 1 from unnest(v_resources) x(resource_id)
    where not exists(
      select 1
      from market.booking_offer_resources bor
      join market.booking_resources r on r.id=bor.resource_id
      where bor.offer_id=p_offer and bor.resource_id=x.resource_id and r.seller_id=v_seller and r.active
    )
  ) then raise exception 'Wybrano zasób spoza tej oferty lub nieaktywny'; end if;

  delete from market.booking_service_resources sr where sr.service_id=p_service;
  insert into market.booking_service_resources(service_id,resource_id)
  select p_service,resource_id from unnest(v_resources) x(resource_id)
  on conflict do nothing;
end;$$;

revoke all on function market.seller_booking_service_resources_replace(uuid,uuid,uuid[]) from public;
revoke execute on function market.seller_booking_service_resources_replace(uuid,uuid,uuid[]) from anon;
grant execute on function market.seller_booking_service_resources_replace(uuid,uuid,uuid[]) to authenticated;
