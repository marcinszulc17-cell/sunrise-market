alter table market.shipments
  add column if not exists tracking_last_checked_at timestamptz,
  add column if not exists tracking_check_attempts integer not null default 0,
  add column if not exists tracking_last_error text;

create index if not exists shipments_active_tracking_poll_idx
  on market.shipments(tracking_last_checked_at, created_at)
  where status <> 'delivered' and (tracking_no is not null or gk_number is not null or gk_hash is not null);

create or replace function market.courier_mark_shipment_delivered(p_shipment uuid,p_carrier text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s market.shipments%rowtype;
  r record;
  v_count integer:=0;
begin
  select * into s
  from market.shipments
  where id=p_shipment
  for update;

  if s.id is null then return 0; end if;
  if s.status='delivered' then return 0; end if;

  update market.shipments
  set status='delivered',tracking_last_checked_at=now(),tracking_last_error=null,updated_at=now()
  where id=s.id;

  for r in
    select ft.id task_id,ft.order_id,ft.seller_id,o.buyer_id,ft.title
    from market.fulfillment_tasks ft
    join market.orders o on o.id=ft.order_id
    where ft.order_id=s.order_id
      and coalesce(ft.status,'pending')='shipped'
      and (s.seller_id is null or ft.seller_id=s.seller_id)
      and (
        ft.tracking_no is null
        or s.tracking_no is null
        or ft.tracking_no=s.tracking_no
        or ft.tracking_no=s.gk_number
      )
    for update of ft
  loop
    update market.fulfillment_tasks
    set status='delivered',tracking_no=coalesce(tracking_no,s.tracking_no,s.gk_number),updated_at=now()
    where id=r.task_id and status='shipped';

    if not found then continue; end if;

    insert into market.sale_fulfillment_events(task_id,order_id,seller_id,buyer_id,event_type,details)
    values(r.task_id,r.order_id,r.seller_id,r.buyer_id,'delivered',jsonb_build_object('source','courier','carrier',coalesce(p_carrier,s.carrier,'GlobKurier'),'shipment_id',s.id,'tracking_no',coalesce(s.tracking_no,s.gk_number),'title',r.title))
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
        values(r.task_id,r.order_id,r.seller_id,r.buyer_id,'buyer_notified',jsonb_build_object('notification_type','order_item_delivered','source','courier','shipment_id',s.id))
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

revoke all on function market.courier_mark_shipment_delivered(uuid,text) from public, anon, authenticated;
grant execute on function market.courier_mark_shipment_delivered(uuid,text) to service_role;

create or replace function market.courier_tracking_poll_candidates(p_limit integer default 50)
returns table(shipment_id uuid,order_id uuid,seller_id uuid,tracking_no text,gk_number text,gk_hash text,carrier text)
language sql
security definer
set search_path to ''
as $function$
  select s.id,s.order_id,s.seller_id,s.tracking_no,s.gk_number,s.gk_hash,s.carrier
  from market.shipments s
  where s.status <> 'delivered'
    and (nullif(s.tracking_no,'') is not null or nullif(s.gk_number,'') is not null or nullif(s.gk_hash,'') is not null)
    and (s.tracking_last_checked_at is null or s.tracking_last_checked_at < now()-interval '10 minutes')
    and exists (
      select 1 from market.fulfillment_tasks ft
      where ft.order_id=s.order_id
        and ft.status='shipped'
        and (s.seller_id is null or ft.seller_id=s.seller_id)
    )
  order by coalesce(s.tracking_last_checked_at,'epoch'::timestamptz),s.created_at
  limit greatest(1,least(coalesce(p_limit,50),100));
$function$;

revoke all on function market.courier_tracking_poll_candidates(integer) from public, anon, authenticated;
grant execute on function market.courier_tracking_poll_candidates(integer) to service_role;

create or replace function market.courier_tracking_record_check(p_shipment uuid,p_error text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update market.shipments
  set tracking_last_checked_at=now(),
      tracking_check_attempts=tracking_check_attempts+1,
      tracking_last_error=case when p_error is null then null else left(p_error,1000) end,
      updated_at=now()
  where id=p_shipment and status<>'delivered';
end;
$function$;

revoke all on function market.courier_tracking_record_check(uuid,text) from public, anon, authenticated;
grant execute on function market.courier_tracking_record_check(uuid,text) to service_role;
