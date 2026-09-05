-- Akcje masowe na ofertach + promocje (decyzja właściciela 2026-09-05).
--
-- Promocja = obniżka procentowa na czas określony. Model: price_gross jest zawsze ceną
-- AKTUALNIE OBOWIĄZUJĄCĄ (checkout, koszyk i listing nic nie muszą przeliczać), a
-- attributes.promo = {"percent": 15, "old_price": 1000, "from": ts, "until": ts} niesie
-- cenę sprzed promocji i termin. Po terminie expire_offer_promos() (pg_cron co godzinę)
-- przywraca old_price i usuwa promo. Zmiany ręczne/masowe ceny na ofertach z MySunrise
-- ustawiają attributes.price_locked=true — mysunrise-sync wtedy nie nadpisuje ceny.

create or replace function market.bulk_update_my_offers(
  p_offer_ids uuid[],
  p_action text,
  p_value numeric default null,
  p_until timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid := market.current_seller_id();
  v_op boolean := coalesce(market.is_operator(), false);
  v_n int := 0;
  v_ids uuid[];
begin
  if v_seller is null and not v_op then return jsonb_build_object('ok', false, 'error', 'not_seller'); end if;
  if p_offer_ids is null or coalesce(array_length(p_offer_ids,1),0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;

  -- tylko własne oferty (operator: dowolne), nigdy zarchiwizowane ani zablokowane
  select coalesce(array_agg(o.id), '{}') into v_ids
  from market.offers o
  where o.id = any(p_offer_ids)
    and (v_op or o.seller_id = v_seller)
    and o.status not in ('archived','blocked');

  if p_action = 'price_percent' then
    if p_value is null or p_value <= -100 then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;
    update market.offers set
      price_gross = round(price_gross * (1 + p_value/100.0), 2),
      attributes = coalesce(attributes,'{}'::jsonb)
        || jsonb_build_object('price_locked', true)
        || case when attributes ? 'promo' then jsonb_build_object('promo', (attributes->'promo') || jsonb_build_object('old_price', round(((attributes->'promo'->>'old_price')::numeric) * (1 + p_value/100.0), 2))) else '{}'::jsonb end,
      updated_at = now()
    where id = any(v_ids) and price_gross > 0;
    get diagnostics v_n = row_count;

  elsif p_action = 'price_set' then
    if p_value is null or p_value <= 0 then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;
    update market.offers set
      price_gross = round(p_value, 2),
      attributes = (coalesce(attributes,'{}'::jsonb) - 'promo') || jsonb_build_object('price_locked', true),
      updated_at = now()
    where id = any(v_ids);
    get diagnostics v_n = row_count;

  elsif p_action = 'stock_set' then
    if p_value is null or p_value < 0 then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;
    update market.offers set stock = floor(p_value)::int, updated_at = now() where id = any(v_ids);
    get diagnostics v_n = row_count;

  elsif p_action = 'hide' then
    update market.offers set status = 'paused', updated_at = now() where id = any(v_ids) and status <> 'paused';
    get diagnostics v_n = row_count;

  elsif p_action = 'show' then
    update market.offers set status = 'active', updated_at = now() where id = any(v_ids) and status <> 'active';
    get diagnostics v_n = row_count;

  elsif p_action = 'promo_set' then
    if p_value is null or p_value <= 0 or p_value >= 90 then return jsonb_build_object('ok', false, 'error', 'invalid_value', 'message', 'Rabat musi być między 1% a 89%'); end if;
    if p_until is null or p_until <= now() then return jsonb_build_object('ok', false, 'error', 'invalid_until', 'message', 'Podaj datę zakończenia promocji w przyszłości'); end if;
    update market.offers o set
      price_gross = round(coalesce((o.attributes->'promo'->>'old_price')::numeric, o.price_gross) * (1 - p_value/100.0), 2),
      attributes = coalesce(o.attributes,'{}'::jsonb) || jsonb_build_object('promo', jsonb_build_object(
        'percent', p_value,
        'old_price', coalesce((o.attributes->'promo'->>'old_price')::numeric, o.price_gross),
        'from', now(),
        'until', p_until
      )),
      updated_at = now()
    where o.id = any(v_ids) and o.price_gross > 0;
    get diagnostics v_n = row_count;

  elsif p_action = 'promo_clear' then
    update market.offers o set
      price_gross = coalesce((o.attributes->'promo'->>'old_price')::numeric, o.price_gross),
      attributes = coalesce(o.attributes,'{}'::jsonb) - 'promo',
      updated_at = now()
    where o.id = any(v_ids) and o.attributes ? 'promo';
    get diagnostics v_n = row_count;

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end if;

  return jsonb_build_object('ok', true, 'updated', v_n, 'selected', coalesce(array_length(v_ids,1),0));
end;
$$;
revoke all on function market.bulk_update_my_offers(uuid[], text, numeric, timestamptz) from public;
grant execute on function market.bulk_update_my_offers(uuid[], text, numeric, timestamptz) to authenticated;

-- Wygaszanie promocji po terminie.
create or replace function market.expire_offer_promos() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update market.offers o set
    price_gross = coalesce((o.attributes->'promo'->>'old_price')::numeric, o.price_gross),
    attributes = o.attributes - 'promo',
    updated_at = now()
  where o.attributes ? 'promo'
    and (o.attributes->'promo'->>'until')::timestamptz <= now();
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function market.expire_offer_promos() from public;

select cron.schedule('market-expire-offer-promos', '7 * * * *', $$select market.expire_offer_promos()$$);
