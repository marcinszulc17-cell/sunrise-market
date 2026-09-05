-- Cache uprawnien klienta z MySunrise (tylko tabela; trigger wymuszajacy weryfikacje
-- przy zamowieniu NIE jest wlaczany — decyzja odlozona). Uzywane przez edge fn customer-access.
-- Zastosowane na produkcji 2026-09-05.
create table if not exists market.customer_access_cache (
  user_id uuid primary key,
  email text not null,
  registered boolean not null default false,
  verified boolean not null default false,
  reason text not null default 'unknown',
  checked_at timestamptz not null default now()
);
alter table market.customer_access_cache enable row level security;
revoke all on table market.customer_access_cache from public, anon, authenticated;
grant all on table market.customer_access_cache to service_role;
