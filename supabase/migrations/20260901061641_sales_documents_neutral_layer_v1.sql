create table if not exists market.sales_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references market.orders(id) on delete cascade,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  document_type text not null default 'invoice' check (document_type in ('invoice','correction','sale_confirmation','receipt','other')),
  source text not null default 'manual' check (source in ('manual','sunrise_studio','external')),
  status text not null default 'available' check (status in ('pending','available','void')),
  document_number text,
  issued_at date,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  external_provider text,
  external_document_id text,
  integration_status text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_documents_order_seller_idx on market.sales_documents(order_id, seller_id, created_at desc);
create unique index if not exists sales_documents_external_uidx
  on market.sales_documents(external_provider, external_document_id)
  where external_provider is not null and external_document_id is not null;

alter table market.sales_documents enable row level security;
revoke all on table market.sales_documents from anon, authenticated;
grant select, insert, update, delete on table market.sales_documents to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('sales-documents', 'sales-documents', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
