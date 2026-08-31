create or replace function market.enforce_deposit_cashback_exclusion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric := 0;
  v_base numeric := 0;
begin
  if coalesce(new.deposit_gross, 0) <= 0 then
    return new;
  end if;

  select coalesce(pc.value::numeric, 0)
    into v_rate
  from market.platform_config pc
  where pc.key = 'cashback_rate';

  v_base := greatest(
    coalesce(new.total_gross, 0)
      - coalesce(new.deposit_gross, 0)
      - coalesce(new.shipping_cost, 0),
    0
  );

  new.cashback_amount := round(v_base * greatest(v_rate, 0), 2);
  return new;
end;
$$;

drop trigger if exists trg_orders_exclude_deposit_from_cashback on market.orders;
create trigger trg_orders_exclude_deposit_from_cashback
before insert or update of total_gross, deposit_gross, shipping_cost, cashback_amount
on market.orders
for each row
when (coalesce(new.deposit_gross, 0) > 0)
execute function market.enforce_deposit_cashback_exclusion();
