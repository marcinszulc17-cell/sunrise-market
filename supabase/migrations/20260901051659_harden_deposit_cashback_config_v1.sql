create or replace function market.enforce_deposit_cashback_exclusion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rate numeric := 0;
  v_base numeric := 0;
  v_raw text;
begin
  if coalesce(new.deposit_gross,0) <= 0 then
    return new;
  end if;

  begin
    select pc.value into v_raw
    from market.platform_config pc
    where pc.key='cashback_rate'
    limit 1;

    v_rate := coalesce(nullif(btrim(v_raw),''),'0')::numeric;
  exception when others then
    v_rate := 0;
    raise warning 'enforce_deposit_cashback_exclusion: invalid cashback_rate for order %, using 0: %', new.id, sqlerrm;
  end;

  v_base := greatest(coalesce(new.total_gross,0)-coalesce(new.deposit_gross,0)-coalesce(new.shipping_cost,0),0);
  new.cashback_amount := round(v_base * greatest(v_rate,0),2);
  return new;
end;
$function$;