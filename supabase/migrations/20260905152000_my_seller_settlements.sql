-- Rozliczenia sprzedawcy: wypłaty na portfel Sunrise Pay (seller_settlements), nie Stripe payout_runs.
create or replace function market.my_seller_settlements()
returns table(id uuid, order_id uuid, amount numeric, status text, created_at timestamptz, settled_at timestamptz, available_at timestamptz, last_error text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.order_id, s.amount, s.status, s.created_at, s.settled_at, s.available_at, s.last_error
  from market.seller_settlements s
  where s.seller_id = market.current_seller_id()
  order by s.created_at desc limit 200;
$$;
revoke all on function market.my_seller_settlements() from public;
grant execute on function market.my_seller_settlements() to authenticated;
