alter table market.wallet_topups
  add column if not exists credit_attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists wallet_topups_credit_retry_idx
  on market.wallet_topups(status, updated_at)
  where credited = false and status in ('pending', 'failed');
