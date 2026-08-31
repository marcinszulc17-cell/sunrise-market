-- Seller controls for own offers: hide/show and safe archive.
-- Production functions were applied through Supabase migration tooling; this file keeps repo schema in sync.

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
begin
  v_seller := market.current_seller_id();
  if v_seller is null then return jsonb_build_object('ok',false,'error','not_seller'); end if;

  select o.seller_id, o.status into v_owner, v_status
  from market.offers o where o.id = p_offer;

  if v_owner is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_owner <> v_seller then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if v_status = 'archived' then return jsonb_build_object('ok',false,'error','archived','message','Usuniętej oferty nie można ponownie pokazać.'); end if;
  if v_status = 'blocked' then return jsonb_build_object('ok',false,'error','blocked','message','Zablokowana oferta nie może być zmieniana przez sprzedawcę.'); end if;

  update market.offers
  set status = case when p_visible then 'active' else 'paused' end,
      updated_at = now()
  where id = p_offer and seller_id = v_seller;

  return jsonb_build_object('ok',true,'visible',p_visible,'status',case when p_visible then 'active' else 'paused' end);
end;
$$;

revoke all on function market.set_my_offer_visibility(uuid, boolean) from public;
grant execute on function market.set_my_offer_visibility(uuid, boolean) to authenticated;

create or replace function market.delete_my_offer(p_offer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_owner uuid;
begin
  v_seller := market.current_seller_id();
  if v_seller is null then
    return jsonb_build_object('ok', false, 'error', 'not_seller', 'message', 'Brak konta sprzedawcy.');
  end if;

  select o.seller_id into v_owner
  from market.offers o
  where o.id = p_offer;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Oferta nie istnieje.');
  end if;

  if v_owner <> v_seller then
    return jsonb_build_object('ok', false, 'error', 'forbidden', 'message', 'Możesz usuwać tylko własne oferty.');
  end if;

  if exists (
    select 1 from market.bookings b
    where b.offer_id = p_offer
      and b.status in ('held','pending_payment','confirmed')
  ) then
    return jsonb_build_object('ok', false, 'error', 'active_booking', 'message', 'Nie można usunąć oferty z aktywną rezerwacją. Najpierw zakończ lub anuluj rezerwację.');
  end if;

  if exists (
    select 1
    from market.order_items oi
    join market.orders ord on ord.id = oi.order_id
    where oi.offer_id = p_offer
      and ord.status not in ('completed','cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'active_order', 'message', 'Nie można usunąć oferty z niezakończonym zamówieniem.');
  end if;

  update market.offers
  set status = 'archived', stock = 0, updated_at = now()
  where id = p_offer and seller_id = v_seller;

  return jsonb_build_object('ok', true, 'archived', true);
end;
$$;

revoke all on function market.delete_my_offer(uuid) from public;
grant execute on function market.delete_my_offer(uuid) to authenticated;
