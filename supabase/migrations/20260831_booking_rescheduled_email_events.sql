alter table market.booking_mail_outbox
  add column if not exists event_key text not null default 'default';

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_booking_id_event_type_recipient_type_key;

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_booking_event_recipient_event_key_key;

alter table market.booking_mail_outbox
  add constraint booking_mail_outbox_booking_event_recipient_event_key_key
  unique (booking_id, event_type, recipient_type, event_key);

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_event_type_check;

alter table market.booking_mail_outbox
  add constraint booking_mail_outbox_event_type_check
  check (event_type in ('created','confirmed','cancelled','completed','reminder','rescheduled'));

create or replace function market.enqueue_booking_rescheduled_emails(p_booking uuid, p_event_key text)
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
  v_payload jsonb;
  v_key text := coalesce(nullif(p_event_key,''),'default');
begin
  select * into b from market.bookings where id=p_booking;
  if b.id is null then return; end if;

  select o.title,s.email into v_title,v_seller_email
  from market.offers o
  join market.sellers s on s.id=o.seller_id
  where o.id=b.offer_id;

  select u.email::text into v_buyer_email
  from auth.users u
  where u.id=b.buyer_id;

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
    'resource_id',b.resource_id
  );

  if coalesce(v_buyer_email,'')<>'' then
    insert into market.booking_mail_outbox(booking_id,event_type,recipient_type,recipient_email,payload,event_key)
    values(b.id,'rescheduled','buyer',v_buyer_email,v_payload,v_key)
    on conflict do nothing;
  end if;

  if coalesce(v_seller_email,'')<>'' then
    insert into market.booking_mail_outbox(booking_id,event_type,recipient_type,recipient_email,payload,event_key)
    values(b.id,'rescheduled','seller',v_seller_email,v_payload,v_key)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function market.enqueue_booking_rescheduled_emails(uuid,text) from public;
revoke execute on function market.enqueue_booking_rescheduled_emails(uuid,text) from anon;
revoke execute on function market.enqueue_booking_rescheduled_emails(uuid,text) from authenticated;

create or replace function market.booking_reschedule_mail_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_event_key text;
begin
  if new.status='confirmed'
     and (
       new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.resource_id is distinct from old.resource_id
     ) then
    v_event_key := concat_ws('|',
      coalesce(old.updated_at::text,''),
      coalesce(new.updated_at::text,''),
      old.starts_at::text,
      new.starts_at::text,
      coalesce(old.resource_id::text,''),
      coalesce(new.resource_id::text,'')
    );
    perform market.enqueue_booking_rescheduled_emails(new.id,v_event_key);
  end if;
  return new;
end;
$$;

revoke all on function market.booking_reschedule_mail_trigger() from public;
revoke execute on function market.booking_reschedule_mail_trigger() from anon;
revoke execute on function market.booking_reschedule_mail_trigger() from authenticated;

drop trigger if exists booking_reschedule_mail_trigger on market.bookings;
create trigger booking_reschedule_mail_trigger
after update of starts_at,ends_at,resource_id on market.bookings
for each row execute function market.booking_reschedule_mail_trigger();
