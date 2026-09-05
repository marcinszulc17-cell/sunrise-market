-- Ukrywanie/pokazywanie ofert: dostępne dla każdej wystawionej oferty (poza archiwum i blokadą),
-- także dla operatora platformy (nie tylko właściciela oferty). Decyzja właściciela 2026-09-05.
create or replace function market.set_my_offer_visibility(p_offer uuid, p_visible boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_owner uuid;
  v_status text;
  v_operator boolean;
begin
  v_seller := market.current_seller_id();
  v_operator := coalesce(market.is_operator(), false);
  if v_seller is null and not v_operator then return jsonb_build_object('ok',false,'error','not_seller'); end if;

  select o.seller_id, o.status into v_owner, v_status
  from market.offers o where o.id = p_offer;

  if v_owner is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_owner is distinct from v_seller and not v_operator then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if v_status = 'archived' then return jsonb_build_object('ok',false,'error','archived','message','Usuniętej oferty nie można ponownie pokazać.'); end if;
  if v_status = 'blocked' and not v_operator then return jsonb_build_object('ok',false,'error','blocked','message','Zablokowana oferta nie może być zmieniana przez sprzedawcę.'); end if;

  update market.offers
  set status = case when p_visible then 'active' else 'paused' end,
      updated_at = now()
  where id = p_offer;

  return jsonb_build_object('ok',true,'visible',p_visible,'status',case when p_visible then 'active' else 'paused' end);
end;
$$;

revoke all on function market.set_my_offer_visibility(uuid, boolean) from public;
grant execute on function market.set_my_offer_visibility(uuid, boolean) to authenticated;
