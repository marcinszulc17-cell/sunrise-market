-- 2026-09-07: centrum powiadomień z akcjami (decyzja właściciela 2026-09-06). Każde powiadomienie dostaje link i etykietę akcji
-- liczone z typu, klucza dedupe (uuid rezerwacji/zamówienia/wątku) i roli użytkownika (sprzedawca tej rezerwacji czy kupujący).
-- Nowe RPC: my_inbox(p_limit) (z href/action), mark_notification_read(p_id). Stare my_notifications bez zmian (dzwonek).
create or replace function market.notification_link(n market.notifications)
returns table(href text, action text) language plpgsql stable security definer set search_path to '' as $$
declare v_uuid uuid; v_uid uuid := auth.uid(); v_is_seller boolean; v_conv uuid; v_seller_of boolean := false; m text[];
begin
  m := regexp_match(coalesce(n.dedupe_key,''), '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
  if m is not null then v_uuid := m[1]::uuid; end if;
  v_is_seller := exists (select 1 from market.sellers s where s.auth_user_id = v_uid and s.status = 'active');

  if n.type = 'booking' then
    if v_uuid is not null then
      select exists (select 1 from market.bookings b join market.sellers s on s.id = b.seller_id where b.id = v_uuid and s.auth_user_id = v_uid) into v_seller_of;
    end if;
    href := case when v_seller_of then '/sprzedawca/rezerwacje' else '/rezerwacje' end || case when v_uuid is not null then '#b-' || v_uuid::text else '' end;
    action := case
      when n.title ilike 'Kod potwierdzenia%' then 'Pokaż kod'
      when n.title ilike 'Rozlicz kaucję%' then 'Rozlicz kaucję'
      when n.title ilike 'Protokół % do potwierdzenia%' then 'Potwierdź protokół'
      when n.title ilike 'Dziś %' or n.title ilike 'Brak protokołu%' then 'Otwórz protokół'
      when n.title ilike 'Zastrzeżenie%' then 'Zobacz zastrzeżenie'
      else 'Otwórz rezerwację' end;
    return next; return;
  end if;
  if n.type in ('order_paid','new_sale') then
    if v_uuid is not null then select exists (select 1 from market.order_items oi join market.sellers s on s.id = oi.seller_id where oi.order_id = v_uuid and s.auth_user_id = v_uid) into v_seller_of; end if;
    if n.type = 'new_sale' or v_seller_of then href := '/sprzedawca/zamowienia'; action := 'Zrealizuj zamówienie'; else href := '/zamowienia'; action := 'Zobacz zamówienie'; end if;
    return next; return;
  end if;
  if n.type in ('order_shipped','order_ready_for_pickup','order_item_shipped','order_item_handed_over','order_stale') then
    href := '/zamowienia'; action := case when n.type = 'order_ready_for_pickup' then 'Zobacz punkt odbioru' when n.type in ('order_shipped','order_item_shipped') then 'Śledź przesyłkę' when n.type = 'order_item_handed_over' then 'Potwierdź odbiór' else 'Zobacz zamówienie' end;
    return next; return;
  end if;
  if n.type = 'review_request' then href := '/zamowienia'; action := 'Oceń zakup'; return next; return; end if;
  if n.type = 'order_dispute' then
    if v_uuid is not null then select exists (select 1 from market.order_items oi join market.sellers s on s.id = oi.seller_id where oi.order_id = v_uuid and s.auth_user_id = v_uid) into v_seller_of; end if;
    href := case when n.title ilike 'Nowy spór do rozstrzygnięcia%' then '/operator' when v_seller_of then '/sprzedawca/zamowienia' else '/zamowienia' end;
    action := case when n.title ilike 'Spór rozstrzygnięty%' then 'Zobacz decyzję' else 'Zobacz spór' end;
    return next; return;
  end if;
  if n.type = 'message' then
    if v_uuid is not null then
      select c.id into v_conv from market.conversations c where c.id = v_uuid;
      if v_conv is null then select ms.conversation_id into v_conv from market.messages ms where ms.id = v_uuid; end if;
    end if;
    href := '/wiadomosci' || case when v_conv is not null then '?w=' || v_conv::text else '' end; action := 'Odpowiedz'; return next; return;
  end if;
  if n.type = 'new_lead' then href := '/sprzedawca/zapytania'; action := 'Odpowiedz klientowi'; return next; return; end if;
  if n.type = 'seller_review' then href := '/sprzedawca/opinie'; action := 'Odpowiedz na opinię'; return next; return; end if;
  if n.type = 'search' then href := '/szukaj' || case when v_uuid is not null then '?zapisane=' || v_uuid::text else '' end; action := 'Zobacz nowe oferty'; return next; return; end if;
  if n.type = 'price_drop' then href := '/obserwowane'; action := 'Zobacz ofertę'; return next; return; end if;
  href := case when v_is_seller then '/sprzedawca/partner/pulpit' else '/konto' end; action := 'Otwórz';
  return next;
end $$;
revoke all on function market.notification_link(market.notifications) from public, anon;
grant execute on function market.notification_link(market.notifications) to authenticated, service_role;

create or replace function market.my_inbox(p_limit integer default 50)
returns table(id uuid, type text, title text, body text, read boolean, created_at timestamptz, href text, action text)
language sql stable security definer set search_path to '' as $$
  select n.id, n.type, n.title, n.body, n.read, n.created_at, l.href, l.action
  from market.notifications n cross join lateral market.notification_link(n) l
  where n.user_id = auth.uid() order by n.read asc, n.created_at desc limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;
revoke all on function market.my_inbox(integer) from public, anon;
grant execute on function market.my_inbox(integer) to authenticated, service_role;

create or replace function market.mark_notification_read(p_id uuid)
returns void language sql security definer set search_path to '' as $$
  update market.notifications set read = true where id = p_id and user_id = auth.uid();
$$;
revoke all on function market.mark_notification_read(uuid) from public, anon;
grant execute on function market.mark_notification_read(uuid) to authenticated, service_role;

-- dzwonek: też z linkiem (zmiana typu zwracanego → drop)
drop function if exists market.my_notifications();
create function market.my_notifications()
returns table(id uuid, type text, title text, body text, read boolean, created_at timestamptz, href text, action text)
language sql stable security definer set search_path to '' as $$
  select n.id, n.type, n.title, n.body, n.read, n.created_at, l.href, l.action
  from market.notifications n cross join lateral market.notification_link(n) l
  where n.user_id = auth.uid() order by n.created_at desc limit 30;
$$;
revoke all on function market.my_notifications() from public, anon;
grant execute on function market.my_notifications() to authenticated, service_role;
