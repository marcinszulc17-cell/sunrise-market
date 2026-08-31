-- Persist and enforce bonus reversal before a paid booking refund may finalize.

alter table market.booking_refunds
  drop constraint if exists booking_refunds_status_check;
alter table market.booking_refunds
  add constraint booking_refunds_status_check
  check (status in ('preparing','blocked_bonus','bonuses_reversed','payment_failed','refunded','finalize_failed'));

create or replace function market.enforce_booking_refund_bonus_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'refunded'
     and old.status not in ('bonuses_reversed','refunded') then
    raise exception 'Bonusy nie zostały cofnięte przed finalizacją zwrotu';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_refund_bonus_reversal_guard on market.booking_refunds;
create trigger booking_refund_bonus_reversal_guard
before update of status on market.booking_refunds
for each row
execute function market.enforce_booking_refund_bonus_reversal();

revoke all on function market.enforce_booking_refund_bonus_reversal() from public, anon, authenticated;
