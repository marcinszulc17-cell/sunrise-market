alter table market.orders
  add column if not exists card_settlement_status text not null default 'not_started',
  add column if not exists card_settlement_attempts integer not null default 0,
  add column if not exists card_settlement_last_error text,
  add column if not exists card_settlement_updated_at timestamptz,
  add column if not exists card_settled_at timestamptz;

alter table market.orders drop constraint if exists orders_card_settlement_status_check;
alter table market.orders add constraint orders_card_settlement_status_check
  check (card_settlement_status in ('not_started', 'processing', 'settled', 'failed'));

create index if not exists orders_card_settlement_retry_idx
  on market.orders(card_settlement_status, card_settlement_updated_at)
  where payment_provider = 'stripe' and card_settlement_status <> 'settled';

create or replace function market.claim_stripe_order_settlement(
  p_order_id uuid,
  p_stripe_session_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed uuid;
begin
  update market.orders
  set status = case when status = 'created' then 'paid' else status end,
      payment_provider = 'stripe',
      stripe_session_id = coalesce(nullif(p_stripe_session_id, ''), stripe_session_id),
      card_settlement_status = 'processing',
      card_settlement_attempts = card_settlement_attempts + 1,
      card_settlement_last_error = null,
      card_settlement_updated_at = now()
  where id = p_order_id
    and (
      card_settlement_status in ('not_started', 'failed')
      or (
        card_settlement_status = 'processing'
        and card_settlement_updated_at < now() - interval '5 minutes'
      )
    )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function market.claim_stripe_order_settlement(uuid, text) from public, anon, authenticated;
grant execute on function market.claim_stripe_order_settlement(uuid, text) to service_role;
