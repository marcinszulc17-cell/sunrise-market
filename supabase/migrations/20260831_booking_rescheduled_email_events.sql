alter table market.booking_mail_outbox
  add column if not exists event_key text;

update market.booking_mail_outbox
set event_key = event_type
where event_key is null;

alter table market.booking_mail_outbox
  alter column event_key set not null;

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_event_type_check;

alter table market.booking_mail_outbox
  add constraint booking_mail_outbox_event_type_check
  check (event_type in ('created','confirmed','cancelled','completed','reminder','rescheduled'));

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_booking_id_event_type_recipient_type_key;

drop index if exists market.booking_mail_outbox_booking_id_event_type_recipient_type_key;
drop index if exists market.booking_mail_outbox_idempotent_event_idx;

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_booking_id_event_key_recipient_type_key;

alter table market.booking_mail_outbox
  add constraint booking_mail_outbox_booking_id_event_key_recipient_type_key
  unique (booking_id, event_key, recipient_type);

create or replace function market.enqueue_booking_emails(p_booking uuid, p_event text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  b market.bookings%rowtype;
  v_title text;
  v_seller_email text;
  v_buyer_email text;
  v_resource_name text;
  v_timezone text;
  v_payload jsonb;
  v_event_key text;
begin
  select * into b
  from market.bookings
  where id=p_booking;

  if b.id is null then return; end if;

  select o.title,s.email
  into v_title,v_seller_email
  from market.offers o
  join market.sellers s on s.id=o.seller_id
  where o.id=b.offer_id;

  select u.email::text
  into v_buyer_email
  from auth.users u
  where u.id=b.buyer_id;

  select r.name
  into v_resource_name
  from market.booking_resources r
  where r.id=b.resource_id;

  select bo.timezone
  into v_timezone
  from market.booking_offers bo
  where bo.offer_id=b.offer_id;

  v_event_key := case
    when p_event='rescheduled' then p_event||':'||coalesce(b.updated_at::text,clock_timestamp()::text)
    else p_event
  end;

  v_payload:=jsonb_build_object(
    'booking_id',b.id,
    'offer_id',b.offer_id,
    'title',v_title,
    'booking_type',b.booking_type,
    'starts_at',b.starts_at,
    'ends_at',b.ends_at,
    'units',b.units,
    'amount_gross',b.amount_gross,
    'status',b.status,
    'payment_provider',b.payment_provider,
    'resource_id',b.resource_id,
    'resource_name',v_resource_name,
    'timezone',coalesce(v_timezone,'Europe/Warsaw'),
    'updated_at',b.updated_at
  );

  if coalesce(v_buyer_email,'')<>'' then
    insert into market.booking_mail_outbox(
      booking_id,event_type,event_key,recipient_type,recipient_email,payload
    ) values(
      b.id,p_event,v_event_key,'buyer',v_buyer_email,v_payload
    ) on conflict do nothing;
  end if;

  if coalesce(v_seller_email,'')<>'' then
    insert into market.booking_mail_outbox(
      booking_id,event_type,event_key,recipient_type,recipient_email,payload
    ) values(
      b.id,p_event,v_event_key,'seller',v_seller_email,v_payload
    ) on conflict do nothing;
  end if;
end;
$$;

create or replace function market.booking_mail_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op='INSERT' then
    perform market.enqueue_booking_emails(new.id,'created');
  elsif new.status is distinct from old.status
        and new.status in ('confirmed','cancelled','completed') then
    perform market.enqueue_booking_emails(new.id,new.status);
  elsif new.status='confirmed'
        and old.status='confirmed'
        and (
          new.starts_at is distinct from old.starts_at
          or new.ends_at is distinct from old.ends_at
          or new.resource_id is distinct from old.resource_id
        ) then
    perform market.enqueue_booking_emails(new.id,'rescheduled');
  end if;
  return new;
end;
$$;

drop trigger if exists booking_reschedule_mail_trigger on market.bookings;
drop function if exists market.booking_reschedule_mail_trigger();
drop trigger if exists trg_booking_rescheduled_mail on market.bookings;
drop function if exists market.booking_rescheduled_mail_trigger();
drop trigger if exists trg_booking_mail_events on market.bookings;

create trigger trg_booking_mail_events
after insert or update of status,starts_at,ends_at,resource_id
on market.bookings
for each row execute function market.booking_mail_trigger();

revoke all on function market.enqueue_booking_emails(uuid,text) from public;
revoke execute on function market.enqueue_booking_emails(uuid,text) from anon,authenticated;
revoke all on function market.booking_mail_trigger() from public;
revoke execute on function market.booking_mail_trigger() from anon,authenticated;
