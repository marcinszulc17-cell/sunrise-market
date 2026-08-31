alter table market.orders
  add column if not exists invoice_requested boolean not null default false,
  add column if not exists invoice_company_name text,
  add column if not exists invoice_tax_id text,
  add column if not exists invoice_street text,
  add column if not exists invoice_city text,
  add column if not exists invoice_postal text,
  add column if not exists invoice_country text,
  add column if not exists invoice_snapshot_at timestamptz;

alter table market.orders drop constraint if exists orders_invoice_snapshot_complete;
alter table market.orders add constraint orders_invoice_snapshot_complete check (
  invoice_requested = false
  or (
    nullif(btrim(invoice_company_name),'') is not null
    and nullif(btrim(invoice_tax_id),'') is not null
    and nullif(btrim(invoice_street),'') is not null
    and nullif(btrim(invoice_city),'') is not null
    and nullif(btrim(invoice_postal),'') is not null
    and nullif(btrim(invoice_country),'') is not null
    and invoice_snapshot_at is not null
    and (upper(invoice_country) <> 'PL' or invoice_tax_id ~ '^[0-9]{10}$')
  )
);

create or replace function market.protect_order_invoice_snapshot()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.invoice_snapshot_at is not null and (
    new.invoice_requested is distinct from old.invoice_requested
    or new.invoice_company_name is distinct from old.invoice_company_name
    or new.invoice_tax_id is distinct from old.invoice_tax_id
    or new.invoice_street is distinct from old.invoice_street
    or new.invoice_city is distinct from old.invoice_city
    or new.invoice_postal is distinct from old.invoice_postal
    or new.invoice_country is distinct from old.invoice_country
    or new.invoice_snapshot_at is distinct from old.invoice_snapshot_at
  ) then
    raise exception 'Dane faktury są historycznym snapshotem zamówienia i nie mogą być zmienione';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_order_invoice_snapshot on market.orders;
create trigger trg_protect_order_invoice_snapshot
before update of invoice_requested, invoice_company_name, invoice_tax_id, invoice_street, invoice_city, invoice_postal, invoice_country, invoice_snapshot_at
on market.orders
for each row execute function market.protect_order_invoice_snapshot();

revoke all on function market.protect_order_invoice_snapshot() from public;
revoke execute on function market.protect_order_invoice_snapshot() from anon, authenticated;
