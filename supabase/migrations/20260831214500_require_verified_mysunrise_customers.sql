-- MySunrise is the identity hub and source of truth for every Sunrise customer.
-- Market keeps only a short-lived eligibility cache populated by a server-to-server bridge.

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

create or replace function market.require_verified_customer(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'market','public'
as $$
declare
  v market.customer_access_cache%rowtype;
begin
  if p_user is null then raise exception 'Zaloguj się przez MySunrise, aby kontynuować'; end if;

  select * into v
  from market.customer_access_cache
  where user_id=p_user
    and checked_at > now() - interval '30 minutes';

  if v.user_id is null then
    raise exception 'Potwierdź konto w MySunrise, aby kupować i rezerwować';
  end if;
  if not v.registered then
    raise exception 'Najpierw załóż konto w MySunrise';
  end if;
  if not v.verified then
    raise exception 'Dokończ weryfikację konta w MySunrise';
  end if;
end;
$$;

revoke all on function market.require_verified_customer(uuid) from public,anon,authenticated;
grant execute on function market.require_verified_customer(uuid) to service_role;

create or replace function market.enforce_verified_customer_on_transaction()
returns trigger
language plpgsql
security definer
set search_path to 'market','public'
as $$
begin
  perform market.require_verified_customer(new.buyer_id);
  return new;
end;
$$;

revoke all on function market.enforce_verified_customer_on_transaction() from public,anon,authenticated;
grant execute on function market.enforce_verified_customer_on_transaction() to service_role;

drop trigger if exists trg_verified_customer_orders on market.orders;
create trigger trg_verified_customer_orders
before insert on market.orders
for each row execute function market.enforce_verified_customer_on_transaction();

drop trigger if exists trg_verified_customer_bookings on market.bookings;
create trigger trg_verified_customer_bookings
before insert on market.bookings
for each row execute function market.enforce_verified_customer_on_transaction();
