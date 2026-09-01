create table if not exists market.booking_handover_protocols (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references market.bookings(id) on delete cascade,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  buyer_id uuid not null,
  resource_id uuid references market.booking_resources(id) on delete set null,
  resource_kind text,
  status text not null default 'draft' check (status in ('draft','issued','returned','closed')),
  handover_at timestamptz,
  handover_odometer integer check (handover_odometer is null or handover_odometer >= 0),
  handover_fuel_percent smallint check (handover_fuel_percent is null or handover_fuel_percent between 0 and 100),
  handover_condition text,
  handover_notes text,
  handover_kit_complete boolean,
  return_at timestamptz,
  return_odometer integer check (return_odometer is null or return_odometer >= 0),
  return_fuel_percent smallint check (return_fuel_percent is null or return_fuel_percent between 0 and 100),
  return_condition text,
  return_notes text,
  return_kit_complete boolean,
  damage_found boolean not null default false,
  damage_note text,
  deposit_decision text not null default 'pending' check (deposit_decision in ('pending','refund','partial','retain')),
  deposit_retained_requested_gross numeric(12,2) not null default 0 check (deposit_retained_requested_gross >= 0),
  deposit_decision_note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_handover_protocols_seller_idx
  on market.booking_handover_protocols(seller_id, updated_at desc);
create index if not exists booking_handover_protocols_resource_idx
  on market.booking_handover_protocols(resource_id, updated_at desc)
  where resource_id is not null;

create table if not exists market.booking_protocol_photos (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references market.booking_handover_protocols(id) on delete cascade,
  booking_id uuid not null references market.bookings(id) on delete cascade,
  phase text not null check (phase in ('handover','return')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists booking_protocol_photos_booking_idx
  on market.booking_protocol_photos(booking_id, phase, created_at);

alter table market.booking_handover_protocols enable row level security;
alter table market.booking_protocol_photos enable row level security;
revoke all on table market.booking_handover_protocols from anon, authenticated;
revoke all on table market.booking_protocol_photos from anon, authenticated;
grant select, insert, update, delete on table market.booking_handover_protocols to service_role;
grant select, insert, update, delete on table market.booking_protocol_photos to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-protocols',
  'booking-protocols',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function market.seller_booking_deposit_prepare_v2(
  p_booking uuid,
  p_action text,
  p_retain_gross numeric default null
)
returns table(
  booking_id uuid,
  order_id uuid,
  buyer_email text,
  seller_email text,
  payment_provider text,
  stripe_session_id text,
  deposit_gross numeric,
  refund_gross numeric,
  retain_gross numeric,
  deposit_status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v market.bookings%rowtype;
  v_order market.orders%rowtype;
  v_retain numeric(12,2) := 0;
  v_refund numeric(12,2) := 0;
  v_protocol_ready boolean := false;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_action not in ('refund','retain','partial') then raise exception 'Nieprawidłowa akcja kaucji'; end if;

  select * into v from market.bookings where id=p_booking for update;
  if v.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not(v.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;
  if coalesce(v.deposit_gross,0)<=0 then raise exception 'Ta rezerwacja nie ma kaucji'; end if;
  if v.deposit_status not in ('held','failed') then raise exception 'Kaucja nie jest gotowa do rozliczenia'; end if;
  if v.ends_at > now() then raise exception 'Kaucję można rozliczyć dopiero po zakończeniu rezerwacji'; end if;

  if p_action='refund' and v.status not in ('cancelled','completed','no_show') then
    raise exception 'Kaucję można zwrócić po anulowaniu albo zakończeniu rezerwacji';
  end if;
  if p_action in ('retain','partial') and v.status not in ('completed','no_show') then
    raise exception 'Potrącenie kaucji jest możliwe po zakończeniu rezerwacji';
  end if;

  if p_action in ('retain','partial') then
    select exists(
      select 1 from market.booking_handover_protocols p
      where p.booking_id=v.id and p.return_at is not null and p.status in ('returned','closed')
    ) into v_protocol_ready;
    if not v_protocol_ready then
      raise exception 'Najpierw uzupełnij protokół zwrotu';
    end if;
  end if;

  if p_action='retain' then
    v_retain := round(v.deposit_gross,2);
  elsif p_action='partial' then
    v_retain := round(coalesce(p_retain_gross,-1),2);
    if v_retain <= 0 or v_retain >= round(v.deposit_gross,2) then
      raise exception 'Kwota potrącenia musi być większa od 0 i mniejsza od kaucji';
    end if;
  else
    v_retain := 0;
  end if;
  v_refund := round(v.deposit_gross,2) - v_retain;

  select * into v_order from market.orders where id=v.order_id;
  if v_order.id is null or v_order.status<>'paid' then raise exception 'Brak opłaconego zamówienia'; end if;

  update market.bookings
  set deposit_status=case when p_action='refund' then 'refunding' else 'retaining' end,
      deposit_resolution_note=null,
      updated_at=now()
  where id=v.id;

  return query
  select v.id,v.order_id,bu.email::text,se.email::text,v.payment_provider,v_order.stripe_session_id,
         round(v.deposit_gross,2),v_refund,v_retain,
         case when p_action='refund' then 'refunding' else 'retaining' end
  from auth.users bu
  join market.sellers se on se.id=v.seller_id
  where bu.id=v.buyer_id;
end;
$function$;

revoke all on function market.seller_booking_deposit_prepare_v2(uuid,text,numeric) from public, anon;
grant execute on function market.seller_booking_deposit_prepare_v2(uuid,text,numeric) to authenticated, service_role;
