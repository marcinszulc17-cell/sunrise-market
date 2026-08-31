create table if not exists market.booking_change_audit (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references market.bookings(id) on delete cascade,
  seller_id uuid not null references market.sellers(id) on delete cascade,
  changed_by uuid,
  change_type text not null check (change_type in ('rescheduled','resource_changed','rescheduled_and_resource_changed')),
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  old_resource_id uuid references market.booking_resources(id) on delete set null,
  new_resource_id uuid references market.booking_resources(id) on delete set null,
  locked_base_amount_gross numeric(14,2) not null default 0,
  locked_fees_gross numeric(14,2) not null default 0,
  locked_deposit_gross numeric(14,2) not null default 0,
  locked_amount_gross numeric(14,2) not null default 0,
  price_policy text not null default 'locked_at_booking',
  created_at timestamptz not null default now()
);

create index if not exists booking_change_audit_booking_created_idx
  on market.booking_change_audit(booking_id,created_at desc);
create index if not exists booking_change_audit_seller_created_idx
  on market.booking_change_audit(seller_id,created_at desc);

alter table market.booking_change_audit enable row level security;
revoke all on table market.booking_change_audit from public,anon,authenticated;

create or replace function market.booking_change_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_type text;
begin
  if new.status='confirmed'
     and old.status='confirmed'
     and (
       new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.resource_id is distinct from old.resource_id
     ) then
    v_type := case
      when (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
           and new.resource_id is distinct from old.resource_id then 'rescheduled_and_resource_changed'
      when new.resource_id is distinct from old.resource_id then 'resource_changed'
      else 'rescheduled'
    end;

    insert into market.booking_change_audit(
      booking_id,seller_id,changed_by,change_type,
      old_starts_at,old_ends_at,new_starts_at,new_ends_at,
      old_resource_id,new_resource_id,
      locked_base_amount_gross,locked_fees_gross,locked_deposit_gross,locked_amount_gross,price_policy
    ) values (
      new.id,new.seller_id,auth.uid(),v_type,
      old.starts_at,old.ends_at,new.starts_at,new.ends_at,
      old.resource_id,new.resource_id,
      coalesce(old.base_amount_gross,0),coalesce(old.fees_gross,0),coalesce(old.deposit_gross,0),coalesce(old.amount_gross,0),'locked_at_booking'
    );
  end if;
  return new;
end;
$$;

revoke all on function market.booking_change_audit_trigger() from public;
revoke execute on function market.booking_change_audit_trigger() from anon,authenticated;

drop trigger if exists trg_booking_change_audit on market.bookings;
create trigger trg_booking_change_audit
after update of starts_at,ends_at,resource_id on market.bookings
for each row execute function market.booking_change_audit_trigger();

create or replace function market.seller_booking_change_history(p_booking uuid)
returns table(
  id uuid,
  change_type text,
  old_starts_at timestamptz,
  old_ends_at timestamptz,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  old_resource_id uuid,
  old_resource_name text,
  new_resource_id uuid,
  new_resource_name text,
  locked_amount_gross numeric,
  price_policy text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_booking market.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  select b.* into v_booking from market.bookings b where b.id=p_booking;
  if v_booking.id is null then raise exception 'Nie znaleziono rezerwacji'; end if;
  if not (v_booking.seller_id=market.current_seller_id() or market.is_operator()) then raise exception 'Brak dostępu'; end if;

  return query
  select a.id,a.change_type,a.old_starts_at,a.old_ends_at,a.new_starts_at,a.new_ends_at,
         a.old_resource_id,ro.name,a.new_resource_id,rn.name,
         a.locked_amount_gross,a.price_policy,a.created_at
  from market.booking_change_audit a
  left join market.booking_resources ro on ro.id=a.old_resource_id
  left join market.booking_resources rn on rn.id=a.new_resource_id
  where a.booking_id=p_booking
  order by a.created_at desc;
end;
$$;

revoke all on function market.seller_booking_change_history(uuid) from public;
revoke execute on function market.seller_booking_change_history(uuid) from anon;
grant execute on function market.seller_booking_change_history(uuid) to authenticated;