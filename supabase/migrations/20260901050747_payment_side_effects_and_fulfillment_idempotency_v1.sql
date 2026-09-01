alter table market.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_key_uniq
  on market.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create unique index if not exists fulfillment_tasks_order_item_uniq
  on market.fulfillment_tasks(order_item_id)
  where order_item_id is not null;

create unique index if not exists sale_fulfillment_events_task_state_uniq
  on market.sale_fulfillment_events(task_id, event_type)
  where event_type in ('paid','shipped','handed_over','delivered');

create unique index if not exists sale_fulfillment_events_task_notification_uniq
  on market.sale_fulfillment_events(task_id, ((details->>'notification_type')))
  where event_type='buyer_notified' and details ? 'notification_type';

create or replace function market.notify_once(
  p_user uuid,
  p_type text,
  p_title text,
  p_body text,
  p_dedupe_key text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_key text := nullif(btrim(p_dedupe_key),'');
begin
  if p_user is null then return null; end if;
  if v_key is null then raise exception 'Brak klucza idempotencji powiadomienia'; end if;

  insert into market.notifications(user_id,type,title,body,dedupe_key)
  values(p_user,p_type,p_title,p_body,v_key)
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select n.id into v_id
    from market.notifications n
    where n.user_id=p_user and n.dedupe_key=v_key
    limit 1;
  end if;

  return v_id;
end;
$function$;

revoke all on function market.notify_once(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function market.notify_once(uuid,text,text,text,text) to service_role;

create or replace function market.notify_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_buyer uuid;
  v_total numeric;
  r record;
  v_suser uuid;
begin
  select o.buyer_id,o.total_gross
    into v_buyer,v_total
  from market.orders o
  where o.id=p_order;

  if v_buyer is not null then
    begin
      perform market.notify_once(
        v_buyer,
        'order_paid',
        'Zamówienie opłacone',
        'Dziękujemy! Zapłacono '||coalesce(v_total,0)||' zł. Cashback został naliczony w punktach MySunrise.',
        'order_paid:'||p_order::text
      );
    exception when others then
      raise warning 'buyer notification failed for order %: %', p_order, sqlerrm;
    end;
  end if;

  for r in
    select oi.seller_id,sum(oi.seller_payout) net
    from market.order_items oi
    where oi.order_id=p_order
    group by oi.seller_id
  loop
    v_suser := null;
    select u.id
      into v_suser
    from market.sellers s
    join auth.users u on lower(u.email)=lower(s.email)
    where s.id=r.seller_id
    limit 1;

    if v_suser is not null then
      begin
        perform market.notify_once(
          v_suser,
          'new_sale',
          'Nowa sprzedaż!',
          'Sprzedano Twoją ofertę. Do rozliczenia sprzedawcy przypisano '||round(coalesce(r.net,0),2)||' zł po prowizji platformy.',
          'new_sale:'||p_order::text||':'||r.seller_id::text
        );
      exception when others then
        raise warning 'seller notification failed for order %, seller %: %', p_order, r.seller_id, sqlerrm;
      end;
    else
      raise warning 'seller auth user not found for order %, seller %; notification skipped', p_order, r.seller_id;
    end if;
  end loop;
exception when others then
  raise warning 'notify_order failed for order %: %', p_order, sqlerrm;
end;
$function$;

create or replace function market.create_fulfillment_tasks(p_order uuid)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $function$
begin
  insert into market.fulfillment_tasks(
    order_id, order_item_id, offer_id, seller_id, lane, provider, sku, title, qty, unit_price_gross,
    ship_name, ship_phone, ship_street, ship_city, ship_postal, ship_country)
  select
    o.id, oi.id, oi.offer_id, oi.seller_id,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then 'dropship' when 'mysunrise' then 'mysunrise' else 'seller' end,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then 'teemdrop' when 'mysunrise' then 'mysunrise' else s.legal_name end,
    case coalesce(of2.fulfillment_provider,'seller')
      when 'teemdrop' then of2.attributes->>'teemdrop_spu'
      when 'mysunrise' then of2.attributes->>'mysunrise_sku' else null end,
    of2.title, oi.qty, oi.unit_price_gross,
    o.ship_name, o.ship_phone, o.ship_street, o.ship_city, o.ship_postal, o.ship_country
  from market.orders o
  join market.order_items oi on oi.order_id=o.id
  join market.offers of2 on of2.id=oi.offer_id
  join market.sellers s on s.id=oi.seller_id
  where o.id=p_order
  on conflict (order_item_id) where order_item_id is not null do nothing;
end;
$function$;

create or replace function market.trg_order_paid_fulfillment()
returns trigger
language plpgsql
security definer
set search_path to 'market','public'
as $function$
begin
  if new.status='paid' and (old.status is distinct from 'paid') then
    begin
      perform market.create_fulfillment_tasks(new.id);
    exception when others then
      raise warning 'paid fulfillment side effect failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

create or replace function market.trg_order_paid_ambassador_outbox()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (tg_op='INSERT' and new.status='paid') or (tg_op='UPDATE' and new.status='paid' and old.status is distinct from 'paid') then
    begin
      perform market.enqueue_ambassador_commission(new.id);
    exception when others then
      raise warning 'paid ambassador side effect failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

create or replace function market.enqueue_teemdrop_bridge()
returns trigger
language plpgsql
security definer
set search_path to 'market','public'
as $function$
begin
  if new.status='paid' and exists (
    select 1 from market.order_items oi
    join market.offers o on o.id=oi.offer_id
    where oi.order_id=new.id and o.fulfillment_provider='teemdrop'
  ) then
    begin
      insert into market.teemdrop_bridge_orders(order_id,status)
      values(new.id,case when market._auto_forward_on() then 'pending' else 'awaiting_approval' end)
      on conflict(order_id) do nothing;
    exception when others then
      raise warning 'paid Teemdrop side effect failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

create or replace function market.private_partner_set_fulfillment(p_task uuid,p_action text,p_tracking text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_seller uuid := market.current_seller_id();
  v_task_id uuid;
  v_task_seller uuid;
  v_type text;
  v_order_status text;
  v_delivery text;
  v_order uuid;
  v_buyer uuid;
  v_title text;
  v_tracking text;
  v_task_status text;
  v_existing_tracking text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;

  select ft.id,ft.seller_id,s.seller_type,o.status,
         case when o.shipping_method='private_pickup' then 'pickup'
              when coalesce(ofr.attributes->>'delivery','')='pickup' then 'pickup'
              else 'shipping' end,
         ft.order_id,o.buyer_id,ft.title,ft.status,ft.tracking_no
  into v_task_id,v_task_seller,v_type,v_order_status,v_delivery,v_order,v_buyer,v_title,v_task_status,v_existing_tracking
  from market.fulfillment_tasks ft
  join market.sellers s on s.id=ft.seller_id
  join market.orders o on o.id=ft.order_id
  join market.offers ofr on ofr.id=ft.offer_id
  where ft.id=p_task
  for update of ft;

  if v_task_id is null then return jsonb_build_object('ok',false,'error','not_found','message','Sprzedaż nie istnieje.'); end if;
  if v_task_seller<>v_seller or v_type<>'private_partner' then return jsonb_build_object('ok',false,'error','forbidden','message','Brak dostępu do tej sprzedaży.'); end if;
  if v_order_status not in ('paid','shipped','delivered','completed') then return jsonb_build_object('ok',false,'error','not_paid','message','Zamówienie nie jest jeszcze opłacone.'); end if;

  if p_action='ship' then
    if v_delivery='pickup' then return jsonb_build_object('ok',false,'error','pickup','message','Ta sprzedaż jest do odbioru osobistego.'); end if;
    if v_task_status='delivered' then return jsonb_build_object('ok',true,'status','delivered','already',true,'tracking_no',v_existing_tracking); end if;
    if v_task_status not in ('pending','shipped') then return jsonb_build_object('ok',false,'error','invalid_state','message','Ta pozycja ma już inny status realizacji.'); end if;

    if v_task_status='pending' then
      v_tracking:=nullif(trim(p_tracking),'');
      update market.fulfillment_tasks
      set status='shipped',tracking_no=v_tracking,updated_at=now()
      where id=p_task and seller_id=v_seller and status='pending';

      insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
      values(p_task,v_order,v_seller,v_buyer,'shipped',auth.uid(),jsonb_build_object('tracking_no',v_tracking,'title',v_title))
      on conflict do nothing;
      v_existing_tracking:=v_tracking;
    end if;

    if not exists (
      select 1 from market.sale_fulfillment_events e
      where e.task_id=p_task and e.event_type='buyer_notified' and e.details->>'notification_type'='order_item_shipped'
    ) then
      begin
        perform market.notify_once(
          v_buyer,'order_item_shipped','Sprzedający wysłał Twój produkt',
          left(v_title,120)||case when v_existing_tracking is not null then '. Nr przesyłki: '||v_existing_tracking else '.' end,
          'order_item_shipped:'||p_task::text
        );
        insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
        values(p_task,v_order,v_seller,v_buyer,'buyer_notified',auth.uid(),jsonb_build_object('notification_type','order_item_shipped'))
        on conflict do nothing;
      exception when others then
        raise warning 'shipment buyer notification failed for task %: %', p_task, sqlerrm;
      end;
    end if;

    return jsonb_build_object('ok',true,'status','shipped','already',(v_task_status='shipped'),'tracking_no',v_existing_tracking);

  elsif p_action='hand_over' then
    if v_delivery<>'pickup' then return jsonb_build_object('ok',false,'error','shipping','message','Ta sprzedaż wymaga wysyłki.'); end if;
    if v_task_status='delivered' then return jsonb_build_object('ok',true,'status','delivered','already',true); end if;
    if v_task_status not in ('pending','handed_over') then return jsonb_build_object('ok',false,'error','invalid_state','message','Ta pozycja ma już inny status realizacji.'); end if;

    if v_task_status='pending' then
      update market.fulfillment_tasks
      set status='handed_over',updated_at=now()
      where id=p_task and seller_id=v_seller and status='pending';

      insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
      values(p_task,v_order,v_seller,v_buyer,'handed_over',auth.uid(),jsonb_build_object('title',v_title))
      on conflict do nothing;
    end if;

    if not exists (
      select 1 from market.sale_fulfillment_events e
      where e.task_id=p_task and e.event_type='buyer_notified' and e.details->>'notification_type'='order_item_handed_over'
    ) then
      begin
        perform market.notify_once(
          v_buyer,'order_item_handed_over','Odbiór osobisty potwierdzony',
          'Sprzedający oznaczył jako przekazane: '||left(v_title,120)||'.',
          'order_item_handed_over:'||p_task::text
        );
        insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
        values(p_task,v_order,v_seller,v_buyer,'buyer_notified',auth.uid(),jsonb_build_object('notification_type','order_item_handed_over'))
        on conflict do nothing;
      exception when others then
        raise warning 'handover buyer notification failed for task %: %', p_task, sqlerrm;
      end;
    end if;

    return jsonb_build_object('ok',true,'status','handed_over','already',(v_task_status='handed_over'));
  end if;

  return jsonb_build_object('ok',false,'error','bad_action','message','Nieprawidłowa akcja.');
end;
$function$;

revoke execute on function market.private_partner_set_fulfillment(uuid,text,text) from anon;
grant execute on function market.private_partner_set_fulfillment(uuid,text,text) to authenticated, service_role;

create or replace function market.buyer_confirm_item_delivery(p_task uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order uuid;
  v_buyer uuid;
  v_seller uuid;
  v_status text;
  v_title text;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;

  select ft.order_id,o.buyer_id,ft.seller_id,coalesce(ft.status,'pending'),ft.title
  into v_order,v_buyer,v_seller,v_status,v_title
  from market.fulfillment_tasks ft
  join market.orders o on o.id=ft.order_id
  where ft.id=p_task
  for update of ft;

  if v_order is null then return jsonb_build_object('ok',false,'error','not_found','message','Pozycja realizacji nie istnieje.'); end if;
  if v_buyer<>auth.uid() then return jsonb_build_object('ok',false,'error','forbidden','message','To nie jest Twoje zamówienie.'); end if;
  if v_status='delivered' then return jsonb_build_object('ok',true,'status','delivered','already',true); end if;
  if v_status<>'shipped' then return jsonb_build_object('ok',false,'error','not_shipped','message','Tę pozycję można potwierdzić dopiero po wysyłce.'); end if;

  update market.fulfillment_tasks set status='delivered',updated_at=now()
  where id=p_task and status='shipped';

  insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,actor_user_id,details)
  values(p_task,v_order,v_seller,v_buyer,'delivered',auth.uid(),jsonb_build_object('source','buyer','title',v_title))
  on conflict do nothing;

  perform market.sync_order_status_from_fulfillment(v_order);
  return jsonb_build_object('ok',true,'status','delivered');
end;
$function$;

create or replace function market.courier_mark_tracking_delivered(p_tracking text,p_carrier text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  v_count int:=0;
begin
  if nullif(trim(p_tracking),'') is null then return 0; end if;

  update market.shipments
  set status='delivered',updated_at=now()
  where (tracking_no=p_tracking or gk_number=p_tracking)
    and status is distinct from 'delivered';

  for r in
    select distinct ft.id task_id,ft.order_id,ft.seller_id,o.buyer_id,ft.title
    from market.fulfillment_tasks ft
    join market.orders o on o.id=ft.order_id
    where coalesce(ft.status,'pending')='shipped'
      and (
        ft.tracking_no=p_tracking
        or exists (
          select 1 from market.shipments s
          where s.order_id=ft.order_id
            and (s.seller_id is null or s.seller_id=ft.seller_id)
            and (s.tracking_no=p_tracking or s.gk_number=p_tracking)
        )
      )
  loop
    update market.fulfillment_tasks
    set status='delivered',tracking_no=coalesce(tracking_no,p_tracking),updated_at=now()
    where id=r.task_id and status='shipped';

    if not found then continue; end if;

    insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,details)
    values(r.task_id,r.order_id,r.seller_id,r.buyer_id,'delivered',jsonb_build_object('source','courier','carrier',p_carrier,'tracking_no',p_tracking,'title',r.title))
    on conflict do nothing;

    perform market.sync_order_status_from_fulfillment(r.order_id);

    if not exists (
      select 1 from market.sale_fulfillment_events e
      where e.task_id=r.task_id and e.event_type='buyer_notified' and e.details->>'notification_type'='order_item_delivered'
    ) then
      begin
        perform market.notify_once(
          r.buyer_id,'order_item_delivered','Przesyłka doręczona',
          left(r.title,120)||' · kurier potwierdził doręczenie.',
          'order_item_delivered:'||r.task_id::text
        );
        insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,details)
        values(r.task_id,r.order_id,r.seller_id,r.buyer_id,'buyer_notified',jsonb_build_object('notification_type','order_item_delivered','source','courier'))
        on conflict do nothing;
      exception when others then
        raise warning 'delivery buyer notification failed for task %: %', r.task_id, sqlerrm;
      end;
    end if;

    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function market.courier_mark_tracking_delivered(text,text) from public, anon, authenticated;
grant execute on function market.courier_mark_tracking_delivered(text,text) to service_role;

do $block$
begin
  if not exists(select 1 from vault.secrets where name='courier_tracking_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
      'courier_tracking_cron_secret',
      'Cron secret for Sunrise Market courier tracking poller'
    );
  end if;
end;
$block$;

create or replace function market.verify_courier_tracking_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((
    select v.decrypted_secret=p_secret
    from vault.decrypted_secrets v
    where v.name='courier_tracking_cron_secret'
    limit 1
  ),false);
$function$;

revoke all on function market.verify_courier_tracking_cron_secret(text) from public, anon, authenticated;
grant execute on function market.verify_courier_tracking_cron_secret(text) to service_role;
