create table if not exists market.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references market.orders(id) on delete cascade,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  seller_email text not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','settled','failed')),
  attempts integer not null default 0,
  mysunrise_tx_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(order_id, seller_id)
);

alter table market.seller_settlements enable row level security;
revoke all on market.seller_settlements from public, anon, authenticated;
grant all on market.seller_settlements to service_role;

create index if not exists seller_settlements_status_idx
  on market.seller_settlements(status, created_at);
create index if not exists seller_settlements_seller_idx
  on market.seller_settlements(seller_id, created_at desc);
