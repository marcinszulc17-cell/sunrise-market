-- Polityka RLS payout_runs odwolywala sie bezposrednio do market.sellers, do ktorej
-- rola authenticated nie ma SELECT -> "permission denied for table sellers" w Rozliczeniach.
-- Uzywamy funkcji security definer market.current_seller_id(). Zastosowane 2026-09-05.
drop policy if exists payout_runs_seller_read on market.payout_runs;
create policy payout_runs_seller_read on market.payout_runs
  for select to authenticated
  using (seller_id = market.current_seller_id());
