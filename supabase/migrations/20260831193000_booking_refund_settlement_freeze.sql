-- Freeze seller payout while a paid-booking refund is in progress.
-- This is intentionally implemented as a status trigger so it does not replace
-- or weaken seller_booking_refund_prepare guards (paid order, pre-start, held deposit).

alter table market.seller_settlements
  drop constraint if exists seller_settlements_status_check;
alter table market.seller_settlements
  add constraint seller_settlements_status_check
  check (status = any(array[
    'scheduled'::text,
    'pending'::text,
    'settled'::text,
    'failed'::text,
    'refund_pending'::text,
    'cancelled'::text
  ]));

create or replace function market.booking_refund_settlement_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'preparing' then
    update market.seller_settlements
       set status = 'refund_pending',
           last_error = null,
           updated_at = now()
     where order_id = new.order_id
       and status in ('scheduled','pending','failed');
  elsif new.status in ('blocked_bonus','payment_failed') then
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

revoke all on function market.booking_refund_settlement_freeze() from public;

drop trigger if exists trg_booking_refund_settlement_freeze on market.booking_refunds;
create trigger trg_booking_refund_settlement_freeze
after insert or update of status on market.booking_refunds
for each row
execute function market.booking_refund_settlement_freeze();
