drop function if exists market.my_orders();
create function market.my_orders()
returns table(
  order_id uuid,
  status text,
  total numeric,
  cashback numeric,
  created_at timestamptz,
  shipping_method text,
  tracking_no text,
  invoice jsonb,
  items jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    o.id,
    o.status,
    o.total_gross,
    o.cashback_amount,
    o.created_at,
    o.shipping_method,
    o.tracking_no,
    jsonb_build_object(
      'requested', o.invoice_requested,
      'company_name', o.invoice_company_name,
      'tax_id', o.invoice_tax_id,
      'street', o.invoice_street,
      'city', o.invoice_city,
      'postal', o.invoice_postal,
      'country', o.invoice_country,
      'snapshot_at', o.invoice_snapshot_at
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'offer_id', oi.offer_id,
      'title', ofr.title,
      'qty', oi.qty,
      'price', oi.unit_price_gross
    ) order by ofr.title) filter (where oi.id is not null), '[]'::jsonb)
  from market.orders o
  left join market.order_items oi on oi.order_id=o.id
  left join market.offers ofr on ofr.id=oi.offer_id
  where o.buyer_id=auth.uid()
  group by o.id
  order by o.created_at desc;
$$;
revoke all on function market.my_orders() from public;
revoke execute on function market.my_orders() from anon;
grant execute on function market.my_orders() to authenticated;

drop function if exists market.seller_orders();
create function market.seller_orders()
returns table(
  order_id uuid,
  status text,
  created_at timestamptz,
  shipping_method text,
  tracking_no text,
  my_total numeric,
  invoice jsonb,
  items jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  with my as (
    select market.current_seller_id() as id
  )
  select
    o.id,
    o.status,
    o.created_at,
    o.shipping_method,
    o.tracking_no,
    sum(oi.seller_payout),
    jsonb_build_object(
      'requested', o.invoice_requested,
      'company_name', o.invoice_company_name,
      'tax_id', o.invoice_tax_id,
      'street', o.invoice_street,
      'city', o.invoice_city,
      'postal', o.invoice_postal,
      'country', o.invoice_country,
      'snapshot_at', o.invoice_snapshot_at
    ),
    jsonb_agg(jsonb_build_object(
      'title', ofr.title,
      'qty', oi.qty,
      'payout', oi.seller_payout
    ) order by ofr.title)
  from market.orders o
  join market.order_items oi on oi.order_id=o.id and oi.seller_id=(select id from my)
  join market.offers ofr on ofr.id=oi.offer_id
  where o.status in ('paid','shipped','delivered','completed')
  group by o.id
  order by o.created_at desc;
$$;
revoke all on function market.seller_orders() from public;
revoke execute on function market.seller_orders() from anon;
grant execute on function market.seller_orders() to authenticated;
