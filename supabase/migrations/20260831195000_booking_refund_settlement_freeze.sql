-- Freeze seller payout while a paid-booking refund is in progress without
-- replacing seller_booking_refund_prepare, so the existing paid/pre-start guards remain authoritative.

alter table market.seller_settlements
  drop constraint if exists seller_settlements_status_check;

alter table market.seller_settlements
  add constraint seller_settlements_status_check
  check (status in ('scheduled','pending','settled','failed','refund_pending','cancelled'));

create or replace function market.sync_booking_refund_settlement_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'preparing' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update market.seller_settlements
    set status = 'refund_pending',
        last_error = null,
        updated_at = now()
    where order_id = new.order_id
      and status in ('scheduled','pending','failed');
  elsif new.status in ('blocked_bonus','payment_failed')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update market.seller_settlements
    set status = case when available_at is not null then 'scheduled' else 'pending' end,
        last_error = null,
        updated_at = now()
    where order_id = new.order_id
      and status = 'refund_pending';
  end if;

  return new;
end;
$$;

revoke all on function market.sync_booking_refund_settlement_state() from public, anon, authenticated;

drop trigger if exists booking_refund_settlement_state_trg on market.booking_refunds;
create trigger booking_refund_settlement_state_trg
after insert or update of status on market.booking_refunds
for each row execute function market.sync_booking_refund_settlement_state();
