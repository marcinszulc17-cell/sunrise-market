-- Stany magazynowe w obie strony (decyzja właściciela 2026-09-05):
--   MySunrise -> Market: mysunrise-sync (co 15 min) przepisuje shop_products.stock_qty do offers.stock
--                        i zapisuje attributes.ms_stock = ta wartość (znacznik "to przyszło z MySunrise").
--   Market -> MySunrise: każda zmiana offers.stock (zakup, anulowanie, akcja masowa, edycja) na ofercie
--                        z MySunrise, która NIE jest echem syncu, jest natychmiast wysyłana do
--                        MySunrise edge fn market-stock-sync (pg_net), token z market.internal_secrets.
create or replace function market.push_stock_to_mysunrise() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_ms_id text; v_marker int;
begin
  if new.fulfillment_provider <> 'mysunrise' then return new; end if;
  if new.stock is not distinct from old.stock then return new; end if;
  v_ms_id := new.attributes->>'mysunrise_id';
  if v_ms_id is null then return new; end if;
  v_marker := nullif(new.attributes->>'ms_stock','')::int;
  -- echo syncu (stock ustawiony razem z ms_stock na tę samą wartość) — nie odsyłamy
  if v_marker is not null and v_marker = new.stock and (old.attributes->>'ms_stock') is distinct from (new.attributes->>'ms_stock') then
    return new;
  end if;
  select value into v_token from market.internal_secrets where key = 'sunrise_pay_service_token';
  if v_token is null then return new; end if;
  perform net.http_post(
    url := 'https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1/market-stock-sync',
    headers := jsonb_build_object('Content-Type','application/json','X-Sunrise-Service-Token', v_token),
    body := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('mysunrise_id', v_ms_id, 'stock', new.stock)))
  );
  -- zapamiętujemy, że MySunrise ma już tę wartość (sync jej nie cofnie w międzyczasie)
  new.attributes := coalesce(new.attributes,'{}'::jsonb) || jsonb_build_object('ms_stock', new.stock);
  return new;
exception when others then
  raise warning 'push_stock_to_mysunrise failed for %: %', new.id, sqlerrm; return new;
end; $$;
drop trigger if exists trg_push_stock_to_mysunrise on market.offers;
create trigger trg_push_stock_to_mysunrise before update of stock, attributes on market.offers
for each row execute function market.push_stock_to_mysunrise();
