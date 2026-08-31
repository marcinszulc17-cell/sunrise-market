create or replace function public.set_fulfillment_status(p_task uuid, p_status text, p_tracking text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_seller uuid;
  v_task market.fulfillment_tasks;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_task is null then raise exception 'task required'; end if;
  if p_status is not null and p_status not in ('pending','processing','shipped','delivered','cancelled','error') then
    raise exception 'invalid fulfillment status';
  end if;

  select * into v_task from market.fulfillment_tasks where id=p_task;
  if v_task.id is null then raise exception 'not found'; end if;

  if not market.ami_operator() then
    select id into v_seller
    from market.sellers
    where lower(email)=lower(auth.jwt() ->> 'email')
    limit 1;
    if v_seller is null or v_seller <> v_task.seller_id or v_task.lane <> 'seller' then
      raise exception 'forbidden';
    end if;
  end if;

  update market.fulfillment_tasks
  set status = coalesce(p_status, status),
      tracking_no = coalesce(nullif(trim(coalesce(p_tracking,'')),''), tracking_no),
      updated_at = now()
  where id = p_task;

  update market.orders o
  set tracking_no = coalesce(o.tracking_no, nullif(trim(coalesce(p_tracking,'')),'')),
      status = case
        when p_status in ('shipped','delivered')
          and not exists (
            select 1 from market.fulfillment_tasks x
            where x.order_id=v_task.order_id
              and x.status not in ('shipped','delivered','cancelled')
          )
        then p_status
        else o.status
      end
  where o.id = v_task.order_id;
end;
$$;

revoke all on function public.set_fulfillment_status(uuid,text,text) from public;
revoke execute on function public.set_fulfillment_status(uuid,text,text) from anon;
grant execute on function public.set_fulfillment_status(uuid,text,text) to authenticated;
