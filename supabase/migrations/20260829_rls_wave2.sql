-- RLS wave 2: high-risk identity and transaction tables.
-- Frontend access goes through SECURITY DEFINER RPCs; Edge Functions use service role.

alter table market.orders enable row level security;
alter table market.buyers enable row level security;
alter table market.returns enable row level security;
alter table market.disputes enable row level security;
alter table market.cashback_ledger enable row level security;
alter table market.sellers enable row level security;

revoke all on table market.orders from anon, authenticated;
revoke all on table market.buyers from anon, authenticated;
revoke all on table market.returns from anon, authenticated;
revoke all on table market.disputes from anon, authenticated;
revoke all on table market.cashback_ledger from anon, authenticated;
revoke all on table market.sellers from anon, authenticated;
