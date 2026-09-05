-- Odbiór własny w Sunrise Market (decyzja właściciela 2026-09-05). Sprzedawca (Partner Handlowy / Sprzedawca)
-- włącza w centrum sprzedaży punkt odbioru (adres, godziny, uwagi). Kupujący widzi w koszyku bezpłatny
-- „Odbiór osobisty u sprzedawcy” obok wysyłki, po opłaceniu — adres i godziny przy zamówieniu.
-- Sprzedawca oznacza „Gotowe do odbioru” (push/in-app do klienta) i „Przekazane klientowi” (→ zamówienie
-- doręczone, Ochrona Kupujących liczy 14 dni jak przy kurierze). Kody dostawy trafiają do orders.shipping_codes.

alter table market.sellers
  add column if not exists pickup_enabled boolean not null default false,
  add column if not exists pickup_address text,
  add column if not exists pickup_hours text,
  add column if not exists pickup_note text;

alter table market.orders add column if not exists shipping_codes text[] not null default '{}';
alter table market.orders add column if not exists pickup_ready_at timestamptz;
alter table market.fulfillment_tasks add column if not exists delivery text not null default 'shipping';

-- Metoda „odbiór u sprzedawcy” dla toru seller_pickup (sprzedawcy z włączonym punktem odbioru).
insert into market.shipping_methods(code, name, carrier, price_gross, lanes, active)
values ('seller_pickup', 'Odbiór osobisty u sprzedawcy', null, 0, array['seller_pickup'], true)
on conflict (code) do update set name = excluded.name, lanes = excluded.lanes, active = true, price_gross = 0;
update market.shipping_methods set lanes = array_append(lanes, 'seller_pickup')
 where code in ('inpost_locker','inpost_courier','dpd') and not ('seller_pickup' = any(lanes));

alter table market.sale_fulfillment_events drop constraint if exists sale_fulfillment_events_event_type_check;
alter table market.sale_fulfillment_events add constraint sale_fulfillment_events_event_type_check
  check (event_type = any (array['paid','seller_seen','shipped','handed_over','delivered','buyer_notified','ready_for_pickup']));

-- Tor koszyka: sprzedawca z punktem odbioru → 'seller_pickup' (wysyłka albo odbiór), reszta bez zmian.
create or replace function market.cart_lanes(p_ids uuid[])
returns table(offer_id uuid, lane text, provider text, eta text)
language sql stable security definer set search_path to 'public','market' as $$
  select o.id as offer_id,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'shipping' then 'private_shipping' when 'pickup' then 'private_pickup' else 'private_both' end
      when coalesce(o.fulfillment_provider,'seller') in ('teemdrop','mysunrise') then 'ours'
      when s.pickup_enabled then 'seller_pickup'
      else 'seller'
    end as lane,
    case when coalesce((o.attributes->>'private_listing')::boolean,false) then 'private_partner' else coalesce(o.fulfillment_provider,'seller') end as provider,
    case
      when coalesce((o.attributes->>'private_listing')::boolean,false) then
        case coalesce(o.attributes->>'delivery','both')
          when 'pickup' then 'Do ustalenia ze sprzedającym' when 'shipping' then 'Wysyłka od sprzedającego' else 'Wysyłka lub odbiór osobisty' end
      when o.fulfillment_provider='teemdrop' then '15–25 dni roboczych'
      when o.fulfillment_provider='mysunrise' then '3–7 dni (wysyłka/montaż Sunrise)'
      when s.pickup_enabled then '1–3 dni robocze lub odbiór w punkcie sprzedawcy'
      else '1–3 dni robocze'
    end as eta
  from market.offers o
  left join market.sellers s on s.id = o.seller_id
  where o.id = any(p_ids);
$$;

-- Zadania realizacji: rodzaj dostawy per pozycja na podstawie kodów z zamówienia.
create or replace function market.create_fulfillment_tasks(p_order uuid) returns void
language plpgsql security definer set search_path to 'market','public' as $$
declare v_codes text[];
begin
  select coalesce(shipping_codes,'{}') into v_codes from market.orders where id = p_order;
  insert into market.fulfillment_tasks(
    order_id, order_item_id, offer_id, seller_id, lane, provider, sku, title, qty, unit_price_gross,
    ship_name, ship_phone, ship_street, ship_city, ship_postal, ship_country, delivery)
  select
    o.id, oi.id, oi.offer_id, oi.seller_id,
    case coalesce(of2.fulfillment_provider,'seller') when 'teemdrop' then 'dropship' when 'mysunrise' then 'mysunrise' else 'seller' end,
    case coalesce(of2.fulfillment_provider,'seller') when 'teemdrop' then 'teemdrop' when 'mysunrise' then 'mysunrise' else s.legal_name end,
    case coalesce(of2.fulfillment_provider,'seller') when 'teemdrop' then of2.attributes->>'teemdrop_spu' when 'mysunrise' then of2.attributes->>'mysunrise_sku' else null end,
    of2.title, oi.qty, oi.unit_price_gross,
    o.ship_name, o.ship_phone, o.ship_street, o.ship_city, o.ship_postal, o.ship_country,
    case
      when coalesce((of2.attributes->>'private_listing')::boolean,false)
           and (coalesce(of2.attributes->>'delivery','both') = 'pickup' or 'private_pickup' = any(v_codes)) then 'pickup'
      when coalesce(of2.fulfillment_provider,'seller') = 'mysunrise' and 'pickup' = any(v_codes) then 'pickup'
      when coalesce(of2.fulfillment_provider,'seller') not in ('teemdrop','mysunrise')
           and not coalesce((of2.attributes->>'private_listing')::boolean,false) and 'seller_pickup' = any(v_codes) then 'pickup'
      else 'shipping'
    end
  from market.orders o
  join market.order_items oi on oi.order_id=o.id
  join market.offers of2 on of2.id=oi.offer_id
  join market.sellers s on s.id=oi.seller_id
  where o.id=p_order
  on conflict (order_item_id) where order_item_id is not null do nothing;
end; $$;

-- Ustawienia punktu odbioru (sprzedawca).
create or replace function market.my_pickup_settings() returns jsonb
language sql stable security definer set search_path to 'market' as $$
  select jsonb_build_object('enabled', s.pickup_enabled, 'address', s.pickup_address, 'hours', s.pickup_hours, 'note', s.pickup_note, 'seller_type', s.seller_type)
  from market.sellers s where s.id = market.current_seller_id();
$$;
grant execute on function market.my_pickup_settings() to authenticated;

create or replace function market.set_pickup_settings(p_enabled boolean, p_address text, p_hours text, p_note text) returns jsonb
language plpgsql security definer set search_path to 'market' as $$
declare v_seller uuid := market.current_seller_id();
begin
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  if p_enabled and length(coalesce(trim(p_address),'')) < 8 then raise exception 'Podaj pełny adres punktu odbioru (ulica, numer, miasto)'; end if;
  update market.sellers set pickup_enabled = p_enabled, pickup_address = nullif(trim(p_address),''), pickup_hours = nullif(trim(p_hours),''),
    pickup_note = left(nullif(trim(p_note),''), 500), updated_at = now() where id = v_seller;
  return market.my_pickup_settings();
end; $$;
grant execute on function market.set_pickup_settings(boolean, text, text, text) to authenticated;

-- Sprzedawca: „Gotowe do odbioru” / „Przekazane klientowi” dla całego zamówienia (jego pozycje do odbioru).
create or replace function market.mark_pickup(p_order uuid, p_action text) returns jsonb
language plpgsql security definer set search_path to 'market','public' as $$
declare v_seller uuid := market.current_seller_id(); v_buyer uuid; v_status text; v_n int := 0; r record;
        v_addr text; v_hours text; v_name text;
begin
  if v_seller is null then raise exception 'Brak konta sprzedawcy'; end if;
  select o.buyer_id, o.status into v_buyer, v_status from market.orders o where o.id = p_order;
  if v_buyer is null then raise exception 'Zamówienie nie istnieje'; end if;
  if v_status not in ('paid','shipped') then raise exception 'Zamówienie nie jest opłacone / jest już zakończone'; end if;
  select pickup_address, pickup_hours, coalesce(legal_name, email) into v_addr, v_hours, v_name from market.sellers where id = v_seller;

  for r in select ft.id, ft.status, ft.title from market.fulfillment_tasks ft
           where ft.order_id = p_order and ft.seller_id = v_seller and ft.delivery = 'pickup' for update
  loop
    if p_action = 'ready' and coalesce(r.status,'pending') = 'pending' then
      update market.fulfillment_tasks set status = 'ready_for_pickup', updated_at = now() where id = r.id;
      insert into market.sale_fulfillment_events(task_id, order_id, seller_id, buyer_id, event_type, actor_user_id, details)
      values (r.id, p_order, v_seller, v_buyer, 'ready_for_pickup', auth.uid(), jsonb_build_object('title', r.title)) on conflict do nothing;
      v_n := v_n + 1;
    elsif p_action = 'hand_over' and coalesce(r.status,'pending') in ('pending','ready_for_pickup') then
      update market.fulfillment_tasks set status = 'handed_over', updated_at = now() where id = r.id;
      insert into market.sale_fulfillment_events(task_id, order_id, seller_id, buyer_id, event_type, actor_user_id, details)
      values (r.id, p_order, v_seller, v_buyer, 'handed_over', auth.uid(), jsonb_build_object('title', r.title, 'source', 'seller_pickup')) on conflict do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'nothing_to_update'); end if;

  if p_action = 'ready' then
    update market.orders set pickup_ready_at = coalesce(pickup_ready_at, now()) where id = p_order;
    perform market.notify_once(v_buyer, 'order_ready_for_pickup', 'Zamówienie gotowe do odbioru',
      'Możesz odebrać zamówienie u '||v_name||coalesce(': '||v_addr, '')||coalesce(' ('||v_hours||')', '')||'. Pokaż numer zamówienia przy odbiorze.',
      'order_ready_for_pickup:'||p_order::text);
  else
    perform market.notify_once(v_buyer, 'order_item_handed_over', 'Odbiór potwierdzony przez sprzedawcę',
      'Sprzedawca '||v_name||' oznaczył zamówienie jako przekazane. Jeśli coś się nie zgadza, masz 14 dni na zgłoszenie problemu w Zamówieniach.',
      'order_handed_over:'||p_order::text);
    perform market.sync_order_status_from_fulfillment(p_order);
  end if;
  return jsonb_build_object('ok', true, 'updated', v_n, 'action', p_action);
end; $$;
grant execute on function market.mark_pickup(uuid, text) to authenticated;

-- Sprzedający prywatny: rodzaj dostawy z zadania (wcześniej porównanie z nazwą metody, które nie działało dla „wysyłka albo odbiór”).
create or replace function market.private_partner_set_fulfillment(p_task uuid, p_action text, p_tracking text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_seller uuid := market.current_seller_id(); v_task_id uuid; v_task_seller uuid; v_type text; v_order_status text; v_delivery text;
  v_order uuid; v_buyer uuid; v_title text; v_tracking text; v_task_status text; v_existing_tracking text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  select ft.id, ft.seller_id, s.seller_type, o.status,
         case when ft.delivery = 'pickup' or coalesce(ofr.attributes->>'delivery','') = 'pickup' or 'private_pickup' = any(coalesce(o.shipping_codes,'{}')) then 'pickup' else 'shipping' end,
         ft.order_id, o.buyer_id, ft.title, ft.status, ft.tracking_no
  into v_task_id, v_task_seller, v_type, v_order_status, v_delivery, v_order, v_buyer, v_title, v_task_status, v_existing_tracking
  from market.fulfillment_tasks ft join market.sellers s on s.id=ft.seller_id join market.orders o on o.id=ft.order_id join market.offers ofr on ofr.id=ft.offer_id
  where ft.id=p_task for update of ft;
  if v_task_id is null then return jsonb_build_object('ok',false,'error','not_found','message','Sprzedaż nie istnieje.'); end if;
  if v_task_seller<>v_seller or v_type<>'private_partner' then return jsonb_build_object('ok',false,'error','forbidden','message','Brak dostępu do tej sprzedaży.'); end if;
  if v_order_status not in ('paid','shipped','delivered','completed') then return jsonb_build_object('ok',false,'error','not_paid','message','Zamówienie nie jest jeszcze opłacone.'); end if;

  if p_action='ship' then
    if v_delivery='pickup' then return jsonb_build_object('ok',false,'error','pickup','message','Ta sprzedaż jest do odbioru osobistego.'); end if;
    if v_task_status='delivered' then return jsonb_build_object('ok',true,'status','delivered','already',true,'tracking_no',v_existing_tracking); end if;
    if v_task_status not in ('pending','shipped') then return jsonb_build_object('ok',false,'error','invalid_state','message','Ta pozycja ma już inny status realizacji.'); end if;
    if v_task_status='pending' then
      v_tracking:=nullif(trim(p_tracking),'');
      update market.fulfillment_tasks set status='shipped',tracking_no=v_tracking,updated_at=now() where id=p_task and seller_id=v_seller and status='pending';
      insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
      values(p_task,v_order,v_seller,v_buyer,'shipped',auth.uid(),jsonb_build_object('tracking_no',v_tracking,'title',v_title)) on conflict do nothing;
      v_existing_tracking:=v_tracking;
    end if;
    if not exists (select 1 from market.sale_fulfillment_events e where e.task_id=p_task and e.event_type='buyer_notified' and e.details->>'notification_type'='order_item_shipped') then
      begin
        perform market.notify_once(v_buyer,'order_item_shipped','Sprzedający wysłał Twój produkt',
          left(v_title,120)||case when v_existing_tracking is not null then '. Nr przesyłki: '||v_existing_tracking else '.' end,'order_item_shipped:'||p_task::text);
        insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
        values(p_task,v_order,v_seller,v_buyer,'buyer_notified',auth.uid(),jsonb_build_object('notification_type','order_item_shipped')) on conflict do nothing;
      exception when others then raise warning 'shipment buyer notification failed for task %: %', p_task, sqlerrm; end;
    end if;
    return jsonb_build_object('ok',true,'status','shipped','already',(v_task_status='shipped'),'tracking_no',v_existing_tracking);
  elsif p_action='hand_over' then
    if v_delivery<>'pickup' then return jsonb_build_object('ok',false,'error','shipping','message','Ta sprzedaż wymaga wysyłki.'); end if;
    if v_task_status='delivered' then return jsonb_build_object('ok',true,'status','delivered','already',true); end if;
    if v_task_status not in ('pending','ready_for_pickup','handed_over') then return jsonb_build_object('ok',false,'error','invalid_state','message','Ta pozycja ma już inny status realizacji.'); end if;
    if v_task_status in ('pending','ready_for_pickup') then
      update market.fulfillment_tasks set status='handed_over',updated_at=now() where id=p_task and seller_id=v_seller and status in ('pending','ready_for_pickup');
      insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
      values(p_task,v_order,v_seller,v_buyer,'handed_over',auth.uid(),jsonb_build_object('title',v_title)) on conflict do nothing;
    end if;
    if not exists (select 1 from market.sale_fulfillment_events e where e.task_id=p_task and e.event_type='buyer_notified' and e.details->>'notification_type'='order_item_handed_over') then
      begin
        perform market.notify_once(v_buyer,'order_item_handed_over','Odbiór osobisty potwierdzony','Sprzedający oznaczył jako przekazane: '||left(v_title,120)||'.','order_item_handed_over:'||p_task::text);
        insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
        values(p_task,v_order,v_seller,v_buyer,'buyer_notified',auth.uid(),jsonb_build_object('notification_type','order_item_handed_over')) on conflict do nothing;
      exception when others then raise warning 'handover buyer notification failed for task %: %', p_task, sqlerrm; end;
    end if;
    return jsonb_build_object('ok',true,'status','handed_over','already',(v_task_status='handed_over'));
  end if;
  return jsonb_build_object('ok',false,'error','bad_action','message','Nieprawidłowa akcja.');
end; $$;

-- Synchronizacja statusu zamówienia: „gotowe do odbioru” nie zmienia statusu zamówienia (nadal opłacone).
-- (bez zmian w logice — handed_over/delivered → delivered; shipped → shipped)

-- Kupujący: dane punktu odbioru przy zamówieniu.
drop function if exists market.my_orders();
create function market.my_orders()
returns table(order_id uuid, status text, total numeric, cashback numeric, created_at timestamptz, shipping_method text, tracking_no text, invoice jsonb, items jsonb, pickup jsonb)
language sql stable security definer set search_path to '' as $$
  select o.id, o.status, o.total_gross, o.cashback_amount, o.created_at, o.shipping_method, o.tracking_no,
    jsonb_build_object('requested', o.invoice_requested, 'company_name', o.invoice_company_name, 'tax_id', o.invoice_tax_id, 'street', o.invoice_street,
      'city', o.invoice_city, 'postal', o.invoice_postal, 'country', o.invoice_country, 'snapshot_at', o.invoice_snapshot_at),
    coalesce(jsonb_agg(jsonb_build_object('offer_id', oi.offer_id, 'title', ofr.title, 'qty', oi.qty, 'price', oi.unit_price_gross) order by ofr.title) filter (where oi.id is not null), '[]'::jsonb),
    (select jsonb_agg(distinct jsonb_build_object('seller', coalesce(s.legal_name, 'Sprzedawca'), 'address', s.pickup_address, 'hours', s.pickup_hours, 'note', s.pickup_note,
             'ready', exists (select 1 from market.fulfillment_tasks t2 where t2.order_id = o.id and t2.seller_id = s.id and t2.status in ('ready_for_pickup','handed_over','delivered')),
             'handed_over', exists (select 1 from market.fulfillment_tasks t3 where t3.order_id = o.id and t3.seller_id = s.id and t3.status in ('handed_over','delivered'))))
       from market.fulfillment_tasks ft join market.sellers s on s.id = ft.seller_id
       where ft.order_id = o.id and ft.delivery = 'pickup' and s.seller_type <> 'private_partner')
  from market.orders o
  left join market.order_items oi on oi.order_id=o.id
  left join market.offers ofr on ofr.id=oi.offer_id
  where o.buyer_id=auth.uid()
  group by o.id
  order by o.created_at desc;
$$;
grant execute on function market.my_orders() to authenticated;

-- Sprzedawca: informacja, czy zamówienie jest do odbioru i w jakim stanie.
drop function if exists market.seller_orders();
create function market.seller_orders()
returns table(order_id uuid, status text, created_at timestamptz, shipping_method text, tracking_no text, my_total numeric, invoice jsonb, items jsonb, pickup text)
language sql stable security definer set search_path to '' as $$
  with my as (select market.current_seller_id() as id)
  select o.id, o.status, o.created_at, o.shipping_method, o.tracking_no, sum(oi.seller_payout),
    jsonb_build_object('requested', o.invoice_requested, 'company_name', o.invoice_company_name, 'tax_id', o.invoice_tax_id, 'street', o.invoice_street,
      'city', o.invoice_city, 'postal', o.invoice_postal, 'country', o.invoice_country, 'snapshot_at', o.invoice_snapshot_at),
    jsonb_agg(jsonb_build_object('title', ofr.title, 'qty', oi.qty, 'payout', oi.seller_payout) order by ofr.title),
    (select case when count(*) = 0 then null
                 when bool_and(coalesce(ft.status,'pending') in ('handed_over','delivered')) then 'handed_over'
                 when bool_and(coalesce(ft.status,'pending') in ('ready_for_pickup','handed_over','delivered')) then 'ready'
                 else 'pending' end
       from market.fulfillment_tasks ft where ft.order_id = o.id and ft.seller_id = (select id from my) and ft.delivery = 'pickup')
  from market.orders o
  join market.order_items oi on oi.order_id=o.id and oi.seller_id=(select id from my)
  join market.offers ofr on ofr.id=oi.offer_id
  where o.status in ('paid','shipped','delivered','completed')
  group by o.id
  order by o.created_at desc;
$$;
grant execute on function market.seller_orders() to authenticated;
