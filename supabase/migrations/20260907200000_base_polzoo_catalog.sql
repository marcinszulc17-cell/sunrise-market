-- PolZoo via Base.com: idempotent product mapping for the Sunrise-owned catalog.
create table if not exists market.base_polzoo_product_map (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references market.offers(id) on delete cascade,
  inventory_id bigint not null,
  base_product_id bigint not null,
  sku text,
  ean text,
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_id, base_product_id)
);

create index if not exists base_polzoo_product_map_sku_idx
  on market.base_polzoo_product_map (sku)
  where sku is not null;

create index if not exists base_polzoo_product_map_ean_idx
  on market.base_polzoo_product_map (ean)
  where ean is not null;

alter table market.base_polzoo_product_map enable row level security;
revoke all on table market.base_polzoo_product_map from public, anon, authenticated;
grant all on table market.base_polzoo_product_map to service_role;

comment on table market.base_polzoo_product_map is
  'Private idempotency map for PolZoo products imported from the Base inventory.';

