create table if not exists market.promotion_purchases (
  id uuid primary key,
  seller_id uuid not null references market.sellers(id),
  offer_id uuid not null references market.offers(id),
  days integer not null check (days between 1 and 365),
  amount numeric(10,2) not null check (amount > 0),
  pricing_code text not null default 'highlight_day',
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  mysunrise_tx_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table market.promotion_purchases enable row level security;
revoke all on market.promotion_purchases from public, anon, authenticated;
grant all on market.promotion_purchases to service_role;

create index if not exists promotion_purchases_seller_created_idx
  on market.promotion_purchases(seller_id, created_at desc);

alter table market.promoted_offers
  add column if not exists source_purchase_id uuid references market.promotion_purchases(id);

create unique index if not exists promoted_offers_source_purchase_uidx
  on market.promoted_offers(source_purchase_id)
  where source_purchase_id is not null;
