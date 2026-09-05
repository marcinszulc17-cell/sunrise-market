-- Limity doładowania portfela (2026-09-05): wallet-topup miał sztywne 10–5000 zł, więc przy droższych zakupach
-- (np. 17 tys. zł) „Doładuj i zapłać” kończyło się błędem 400 pokazywanym jako „Edge Function returned a non-2xx”.
-- Teraz limity są w platform_config (topup_min_pln / topup_max_pln) i publikowane przez public_market_config,
-- a koszyk przy braku powyżej limitu kieruje od razu na płatność kartą.
insert into market.platform_config(key,value) values ('topup_min_pln','10'),('topup_max_pln','25000') on conflict (key) do update set value=excluded.value;
create or replace function market.public_market_config() returns jsonb
language sql stable security definer set search_path to 'market','public' as $$
  select jsonb_build_object(
    'cashback_rate', coalesce((select value::numeric from market.platform_config where key='cashback_rate'),0.03),
    'topup_min_pln', coalesce((select value::numeric from market.platform_config where key='topup_min_pln'),10),
    'topup_max_pln', coalesce((select value::numeric from market.platform_config where key='topup_max_pln'),25000)
  );
$$;
