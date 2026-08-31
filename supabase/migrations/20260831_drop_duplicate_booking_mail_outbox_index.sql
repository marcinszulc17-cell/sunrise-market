drop index if exists market.booking_mail_outbox_one_time_event_key;

alter table market.booking_mail_outbox
  drop constraint if exists booking_mail_outbox_booking_event_recipient_key_key;
