-- 2026-09-06 (decyzja właściciela: rabat do 10% za dłuższy najem). booking_offers.length_discounts = [{"min_days":4,"pct":5},{"min_days":8,"pct":10}].
-- market.booking_length_discount(offer, days) → najwyższy próg ≤ days (maks. 50%). Stosowane w booking_daily_quote_v2 i create_booking_hold_v2
-- (rabat od czynszu, nie od kaucji). Publiczny katalog i katalog sprzedawcy zwracają length_discounts; sprzedawca ustawia
-- przez market.set_booking_length_discounts(offer, jsonb) (Ustawienia bookingu → „Rabaty za dłuższy najem”).
alter table market.booking_offers add column if not exists length_discounts jsonb not null default '[]'::jsonb;
create or replace function market.booking_length_discount(p_offer uuid, p_days integer)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce((select max(least(50, greatest(0, (d->>'pct')::numeric))) from market.booking_offers b, jsonb_array_elements(coalesce(b.length_discounts,'[]'::jsonb)) d
                   where b.offer_id = p_offer and (d->>'min_days')::int <= p_days), 0);
$$;
grant execute on function market.booking_length_discount(uuid,integer) to anon, authenticated, service_role;
-- create_booking_hold_v2: po pętli sumującej dni → v_base:=round(v_base*(1-market.booking_length_discount(p_offer,v_units)/100),2);
-- booking_daily_quote_v2: przed return → v_base:=round(v_base*(1-market.booking_length_discount(p_offer,v_days)/100),2);
-- booking_public_catalog: config.length_discounts. (Zastosowane na produkcji przez patch tekstowy definicji funkcji.)
create or replace function market.set_booking_length_discounts(p_offer uuid, p_discounts jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v jsonb := '[]'::jsonb; d jsonb;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if not exists (select 1 from market.booking_offers b where b.offer_id = p_offer and (b.seller_id = market.current_seller_id() or market.is_operator())) then raise exception 'Brak dostępu'; end if;
  for d in select * from jsonb_array_elements(coalesce(p_discounts,'[]'::jsonb)) loop
    if (d->>'min_days')::int >= 2 and (d->>'pct')::numeric > 0 and (d->>'pct')::numeric <= 50 then
      v := v || jsonb_build_object('min_days', (d->>'min_days')::int, 'pct', round((d->>'pct')::numeric, 1));
    end if;
  end loop;
  update market.booking_offers set length_discounts = v where offer_id = p_offer;
  return v;
end $$;
revoke all on function market.set_booking_length_discounts(uuid,jsonb) from public, anon;
grant execute on function market.set_booking_length_discounts(uuid,jsonb) to authenticated, service_role;
